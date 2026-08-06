import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BINANCE_P2P_URL,
  BINANCE_TRADE_TYPE,
  DOLARAPI_RATES_URL,
  RateProviderError,
  aggregateBinanceAdvertisements,
  fetchBinanceP2p,
  resolveServerRates
} from '../api/rate-providers.mjs';
import { createRatesHandler } from '../api/rates.mjs';
import { BCV_CURRENT_URL, BCV_HISTORY_URL } from '../js/bcv-rates.js';

const fixedNow = () => new Date('2026-08-06T01:00:00Z');
const history = [{
  USD: 755.9001,
  updated_at: '2026-08-05T18:54:34.071707-04:00',
  effective_date: '2026-08-06',
  date: '2026-08-05'
}];
const official = {
  moneda: 'USD', fuente: 'oficial', promedio: 755.1552,
  fechaActualizacion: '2026-08-05T00:00:00-04:00'
};
const parallel = {
  moneda: 'USD', fuente: 'paralelo', promedio: 832.361282,
  fechaActualizacion: '2026-08-05T21:01:32.546Z'
};

function response(body, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { ...init, headers });
}

function binance(prices, extra = {}) {
  return {
    code: '000000',
    success: true,
    data: prices.map(price => ({ adv: { price: String(price) } })),
    ...extra
  };
}

function liveFetch({
  binanceBody = binance(Array.from({ length: 20 }, (_, index) => 840 + index)),
  historyBody = history,
  currentBody = history[0],
  dolarBody = [official, parallel]
} = {}) {
  return async (url, init = {}) => {
    if (url === BINANCE_P2P_URL) return response(binanceBody);
    if (url === BCV_HISTORY_URL) return response(historyBody);
    if (url === BCV_CURRENT_URL) return response(currentBody);
    if (url === DOLARAPI_RATES_URL) return response(dolarBody);
    throw new Error(`Unexpected URL: ${url} ${init.method || 'GET'}`);
  };
}

test('aggregates numeric strings deterministically for odd and even samples', () => {
  assert.equal(aggregateBinanceAdvertisements(binance([10, 14, 12, 13, 11]), { minimumValidAds: 1 }).rate, 12);
  assert.equal(aggregateBinanceAdvertisements(binance([10, 13, 11, 12]), { minimumValidAds: 1 }).rate, 11.5);
});

test('valid 20-ad response uses the median and reports range, mean, and sample size', () => {
  const prices = [807, 900, ...Array.from({ length: 18 }, (_, index) => 845 + index / 10)];
  const result = aggregateBinanceAdvertisements(binance(prices));
  assert.equal(result.sampleSize, 20);
  assert.equal(result.minimum, 807);
  assert.equal(result.maximum, 900);
  assert.ok(Math.abs(result.rate - 845.85) < 1e-9);
  assert.notEqual(result.average, result.rate);
});

test('rejects invalid, empty, missing, error, and too-small advertisement responses', () => {
  for (const payload of [
    null,
    {},
    { code: '100001', success: false, data: [] },
    { code: '000000', success: true },
    binance([]),
    binance([1, 2, 3, 4]),
    { code: '000000', success: true, data: [{}, { adv: {} }, { adv: { price: 0 } }] }
  ]) {
    assert.throws(() => aggregateBinanceAdvertisements(payload), RateProviderError);
  }
});

test('filters malformed prices without hiding valid advertisements', () => {
  const payload = binance([840, 841, 842, 843, 844]);
  payload.data.push({}, { adv: {} }, { adv: { price: '-1' } }, { adv: { price: 'NaN' } });
  const result = aggregateBinanceAdvertisements(payload);
  assert.equal(result.sampleSize, 5);
  assert.equal(result.rate, 842);
});

test('rejects an extreme malformed spread instead of publishing it', () => {
  assert.throws(
    () => aggregateBinanceAdvertisements(binance([1, 1, 1, 1, 1000])),
    error => error.code === 'BINANCE_EXTREME_SPREAD'
  );
});

test('server request uses verified SELL direction, 20 rows, and no calculator amount', async () => {
  let requestBody;
  const fetchImpl = async (url, init) => {
    assert.equal(url, BINANCE_P2P_URL);
    requestBody = JSON.parse(init.body);
    return response(binance(Array.from({ length: 20 }, (_, index) => 840 + index)));
  };
  const result = await fetchBinanceP2p({ fetchImpl, now: fixedNow });
  assert.equal(requestBody.tradeType, BINANCE_TRADE_TYPE);
  assert.equal(requestBody.rows, 20);
  assert.equal(requestBody.transAmount, null);
  assert.deepEqual(requestBody.payTypes, []);
  assert.equal(result.aggregation, 'median');
  assert.equal(result.rate, 849.5);
});

for (const status of [400, 403, 429, 500]) {
  test(`rejects Binance HTTP ${status}`, async () => {
    await assert.rejects(fetchBinanceP2p({
      fetchImpl: async () => response({}, { status }), now: fixedNow
    }), error => error.code === 'UPSTREAM_HTTP_ERROR' && error.status === status);
  });
}

test('rejects Binance invalid JSON and wrong content type', async () => {
  await assert.rejects(fetchBinanceP2p({
    fetchImpl: async () => response('{'), now: fixedNow
  }), error => error.code === 'UPSTREAM_INVALID_JSON');
  await assert.rejects(fetchBinanceP2p({
    fetchImpl: async () => response('{}', { headers: { 'content-type': 'text/html' } }), now: fixedNow
  }), error => error.code === 'UPSTREAM_CONTENT_TYPE');
});

test('aborts a timed-out Binance request', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(fetchBinanceP2p({ fetchImpl, now: fixedNow, timeoutMs: 5 }),
    error => error.code === 'UPSTREAM_TIMEOUT');
});

test('resolves BCV and Binance independently when both primary providers succeed', async () => {
  const result = await resolveServerRates({ fetchImpl: liveFetch(), now: fixedNow });
  assert.equal(result.bcv.ok, true);
  assert.equal(result.bcv.source, 'bcv.today');
  assert.equal(result.p2p.ok, true);
  assert.equal(result.p2p.source, 'binance-p2p');
  assert.equal(result.cacheable, true);
});

test('falls back independently to DolarAPI official and parallel with explicit metadata', async () => {
  const fetchImpl = liveFetch({ historyBody: {}, currentBody: {}, binanceBody: {} });
  const result = await resolveServerRates({ fetchImpl, now: fixedNow });
  assert.equal(result.bcv.source, 'dolarapi-oficial');
  assert.equal(result.bcv.status, 'fallback');
  assert.equal(result.p2p.source, 'dolarapi-paralelo');
  assert.equal(result.p2p.status, 'fallback');
  assert.equal(result.cacheable, false);
});

test('one provider failure does not block the other', async () => {
  const noParallel = liveFetch({ binanceBody: {}, dolarBody: [official] });
  const bcvOnly = await resolveServerRates({ fetchImpl: noParallel, now: fixedNow });
  assert.equal(bcvOnly.bcv.ok, true);
  assert.equal(bcvOnly.p2p.ok, false);

  const noOfficial = liveFetch({ historyBody: {}, currentBody: {}, dolarBody: [parallel] });
  const p2pOnly = await resolveServerRates({ fetchImpl: noOfficial, now: fixedNow });
  assert.equal(p2pOnly.bcv.ok, false);
  assert.equal(p2pOnly.p2p.ok, true);
});

test('Vercel handler caches only complete primary success and never browser-caches', async () => {
  const success = createRatesHandler({ fetchImpl: liveFetch(), now: fixedNow });
  const successResponse = await success.fetch(new Request('http://localhost/api/rates'));
  assert.equal(successResponse.status, 200);
  assert.equal(successResponse.headers.get('cache-control'), 'private, no-store');
  assert.match(successResponse.headers.get('vercel-cdn-cache-control'), /s-maxage=45/);

  const partial = createRatesHandler({
    fetchImpl: liveFetch({ binanceBody: {}, dolarBody: [official] }), now: fixedNow
  });
  const partialResponse = await partial.fetch(new Request('http://localhost/api/rates'));
  assert.equal(partialResponse.headers.get('vercel-cdn-cache-control'), null);

  const methodResponse = await success.fetch(new Request('http://localhost/api/rates', { method: 'POST' }));
  assert.equal(methodResponse.status, 405);
});
