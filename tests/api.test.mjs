import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchRates, markP2pRecordCached, RATES_ENDPOINT } from '../js/api.js';

const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const ratesControllerSource = readFileSync(new URL('../js/rates-controller.js', import.meta.url), 'utf8');
const now = () => new Date('2026-08-06T01:00:00Z');
const bcv = {
  ok: true,
  rate: 755.9001,
  effectiveDate: '2026-08-06',
  publishedAt: '2026-08-05T18:54:34.071707-04:00',
  fetchedAt: '2026-08-06T00:59:30Z',
  source: 'bcv.today',
  status: 'announced'
};
const p2p = {
  ok: true,
  rate: 845.975,
  tradeType: 'SELL',
  aggregation: 'median',
  sampleSize: 20,
  fetchedAt: '2026-08-06T00:59:30Z',
  source: 'binance-p2p',
  status: 'current'
};

function response(body, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { ...init, headers });
}

function endpoint(body = { bcv, p2p }) {
  return async url => {
    assert.equal(url, RATES_ENDPOINT);
    return response(body);
  };
}

test('accepts both independently normalized provider results', async () => {
  const result = await fetchRates({ fetchImpl: endpoint(), now });
  assert.equal(result.bcv.ok, true);
  assert.equal(result.bcv.updated, true);
  assert.equal(result.bcv.record.rate, 755.9001);
  assert.equal(result.p2p.ok, true);
  assert.equal(result.p2p.updated, true);
  assert.equal(result.p2p.record.rate, 845.975);
  assert.equal(result.p2p.record.tradeType, 'SELL');
});

test('preserves independent failure states instead of rejecting a partial response', async () => {
  const bcvOnly = await fetchRates({
    fetchImpl: endpoint({ bcv, p2p: { ok: false, error: { code: 'P2P_DOWN' } } }),
    now
  });
  assert.equal(bcvOnly.bcv.ok, true);
  assert.equal(bcvOnly.p2p.ok, false);

  const p2pOnly = await fetchRates({
    fetchImpl: endpoint({ bcv: { ok: false, error: { code: 'BCV_DOWN' } }, p2p }),
    now
  });
  assert.equal(p2pOnly.bcv.ok, false);
  assert.equal(p2pOnly.p2p.ok, true);

  const neither = await fetchRates({
    fetchImpl: endpoint({ bcv: { ok: false }, p2p: { ok: false } }),
    now
  });
  assert.equal(neither.bcv.ok, false);
  assert.equal(neither.p2p.ok, false);
});

test('never replaces newer saved BCV or P2P metadata with an older response', async () => {
  const newerBcv = { ...bcv, fetchedAt: '2026-08-06T00:59:50Z' };
  const newerP2p = { ...p2p, fetchedAt: '2026-08-06T00:59:50Z' };
  const result = await fetchRates({
    cachedBcv: newerBcv,
    cachedP2p: newerP2p,
    fetchImpl: endpoint(),
    now
  });
  assert.equal(result.bcv.updated, false);
  assert.equal(result.bcv.record.fetchedAt, newerBcv.fetchedAt);
  assert.equal(result.p2p.updated, false);
  assert.equal(result.p2p.record.fetchedAt, newerP2p.fetchedAt);
});

test('accepts DolarAPI parallel only as an explicit fallback record', async () => {
  const fallback = {
    ok: true,
    rate: 832.361282,
    tradeType: null,
    aggregation: 'provider-value',
    sampleSize: null,
    fetchedAt: '2026-08-06T00:59:30Z',
    publishedAt: '2026-08-05T21:01:32.546Z',
    source: 'dolarapi-paralelo',
    status: 'fallback'
  };
  const result = await fetchRates({ fetchImpl: endpoint({ bcv, p2p: fallback }), now });
  assert.equal(result.p2p.ok, true);
  assert.equal(result.p2p.record.source, 'dolarapi-paralelo');
  assert.equal(result.p2p.record.status, 'fallback');
  assert.equal(result.p2p.record.tradeType, null);
});

test('rejects malformed endpoint transport without changing provider values', async () => {
  await assert.rejects(fetchRates({ fetchImpl: async () => response({}, { status: 503 }), now }), /HTTP 503/);
  await assert.rejects(fetchRates({
    fetchImpl: async () => response('{}', { headers: { 'content-type': 'text/html' } }), now
  }), /contenido/);
  await assert.rejects(fetchRates({ fetchImpl: async () => response('{'), now }), SyntaxError);
});

test('aborts a timed-out same-origin request', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(fetchRates({ fetchImpl, now, timeoutMs: 5 }), { name: 'AbortError' });
});

test('marks preserved P2P metadata cached and eventually stale', () => {
  assert.equal(markP2pRecordCached(p2p, { now: now() }).status, 'cached');
  assert.equal(markP2pRecordCached(p2p, { now: new Date('2026-08-06T01:20:00Z') }).status, 'stale');
});

test('UI updates each input only when that provider succeeded and persists per-rate records', () => {
  assert.match(ratesControllerSource, /const bcvUpdated = result\.bcv\.ok && result\.bcv\.updated/);
  assert.match(ratesControllerSource, /const p2pUpdated = result\.p2p\.ok && result\.p2p\.updated/);
  assert.match(ratesControllerSource, /if \(bcvUpdated\) els\.bcvRate\.value/);
  assert.match(ratesControllerSource, /if \(p2pUpdated\) els\.p2pRate\.value/);
  assert.match(ratesControllerSource, /bcvRecord: activeBcvRecord/);
  assert.match(ratesControllerSource, /p2pRecord: activeP2pRecord/);
  assert.match(ratesControllerSource, /BCV actualizada\. P2P conservada\./);
  assert.match(ratesControllerSource, /P2P actualizada\. BCV conservada\./);
  assert.match(appSource, /\.\.\.ratesController\.getStoredState\(\)/);
});
