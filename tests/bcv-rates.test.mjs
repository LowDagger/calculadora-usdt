import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BCV_CURRENT_URL,
  BCV_HISTORY_URL,
  formatBcvRateLabel,
  getCaracasDate,
  markBcvRecordCached,
  normalizeHistoryRecord,
  resolveBcvRate,
  selectNewestBcvRecord,
  selectLatestAnnouncedRate
} from '../js/bcv-rates.js';
import { currentBankRate } from '../js/calculator.js';

const regression = JSON.parse(readFileSync(
  new URL('./fixtures/bcv-2026-08-05.json', import.meta.url),
  'utf8'
));
const tuesdayNightUtc = new Date('2026-08-05T03:15:22.230Z');

function record({
  USD = 752.0943,
  updated_at = '2026-08-03T22:03:53.463227Z',
  effective_date = '2026-08-04',
  date = effective_date
} = {}) {
  return { USD, updated_at, effective_date, date };
}

function response(body, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

test('selects a valid current-day rate when it is the only announcement', () => {
  const selected = selectLatestAnnouncedRate([record()], { now: tuesdayNightUtc });
  assert.equal(selected.rate, 752.0943);
  assert.equal(selected.effectiveDate, '2026-08-04');
  assert.equal(selected.status, 'current');
});

test('selects the next-day rate immediately after its Tuesday announcement', () => {
  const selected = selectLatestAnnouncedRate([record(), regression], { now: tuesdayNightUtc });
  assert.deepEqual(selected, {
    rate: 755.1552,
    effectiveDate: '2026-08-05',
    publishedAt: regression.updated_at,
    source: 'bcv.today',
    status: 'announced'
  });
});

test('handles a Friday announcement effective Monday', () => {
  const friday = new Date('2026-08-07T22:00:00Z');
  const monday = record({
    USD: 760.123456,
    updated_at: '2026-08-07T17:30:00-04:00',
    effective_date: '2026-08-10'
  });
  assert.equal(selectLatestAnnouncedRate([monday], { now: friday }).effectiveDate, '2026-08-10');
  assert.equal(selectLatestAnnouncedRate([monday], { now: friday }).status, 'announced');
});

test('deduplicates weekend filler records by effective date rather than date', () => {
  const fridayBase = record({
    effective_date: '2026-07-31',
    date: '2026-07-31',
    updated_at: '2026-07-30T19:00:45.9611-04:00',
    USD: 746.6297
  });
  const saturday = { ...fridayBase, date: '2026-08-01' };
  const sunday = { ...fridayBase, date: '2026-08-02' };
  const selected = selectLatestAnnouncedRate([fridayBase, saturday, sunday], {
    now: new Date('2026-08-02T18:00:00Z')
  });
  assert.equal(selected.effectiveDate, '2026-07-31');
  assert.equal(selected.rate, 746.6297);
});

test('handles holiday or missing-day gaps without requiring consecutive dates', () => {
  const selected = selectLatestAnnouncedRate([
    record(),
    record({ USD: 760, updated_at: '2026-08-04T18:00:00-04:00', effective_date: '2026-08-07' })
  ], { now: tuesdayNightUtc });
  assert.equal(selected.effectiveDate, '2026-08-07');
});

test('keeps the latest publication for duplicate effective dates', () => {
  const older = record({ USD: 754, updated_at: '2026-08-04T15:00:00-04:00', effective_date: '2026-08-05' });
  const newer = record({ USD: 755.1552, updated_at: '2026-08-04T16:49:38-04:00', effective_date: '2026-08-05' });
  assert.equal(selectLatestAnnouncedRate([newer, older], { now: tuesdayNightUtc }).rate, 755.1552);
});

test('rejects invalid USD values, malformed dates, and future publication timestamps', () => {
  for (const USD of [0, -1, NaN, Infinity, 'not-a-rate']) {
    assert.equal(normalizeHistoryRecord(record({ USD }), { now: tuesdayNightUtc }), null);
  }
  assert.equal(normalizeHistoryRecord(record({ effective_date: '2026-02-30' }), { now: tuesdayNightUtc }), null);
  assert.equal(normalizeHistoryRecord(record({ date: '04/08/2026' }), { now: tuesdayNightUtc }), null);
  assert.equal(normalizeHistoryRecord(record({ updated_at: '2026-08-06T20:00:00Z' }), { now: tuesdayNightUtc }), null);
  assert.equal(selectLatestAnnouncedRate([], { now: tuesdayNightUtc }), null);
});

test('falls back from an empty history response to rate.json', async () => {
  const requested = [];
  const result = await resolveBcvRate({
    fetchImpl: async url => {
      requested.push(url);
      return url === BCV_HISTORY_URL ? response([]) : response(record());
    },
    now: () => tuesdayNightUtc
  });
  assert.deepEqual(requested, [BCV_HISTORY_URL, BCV_CURRENT_URL]);
  assert.equal(result.rate, 752.0943);
});

test('falls back to a cached record after HTTP failures', async () => {
  const cachedRecord = {
    rate: 755.1552,
    effectiveDate: '2026-08-05',
    publishedAt: regression.updated_at,
    source: 'bcv.today',
    status: 'announced',
    fetchedAt: '2026-08-04T20:00:00Z'
  };
  const result = await resolveBcvRate({
    cachedRecord,
    fetchImpl: async () => response({}, { status: 503 }),
    now: () => tuesdayNightUtc
  });
  assert.equal(result.rate, 755.1552);
  assert.equal(result.status, 'cached');
});

test('never downgrades a newer cached future rate with an older API response', async () => {
  const cachedRecord = {
    rate: 755.1552,
    effectiveDate: '2026-08-05',
    publishedAt: regression.updated_at,
    source: 'bcv.today',
    status: 'announced',
    fetchedAt: '2026-08-04T19:00:00Z'
  };
  const result = await resolveBcvRate({
    cachedRecord,
    fetchImpl: async url => url === BCV_HISTORY_URL ? response([record()]) : response(record()),
    now: () => tuesdayNightUtc
  });
  assert.equal(result.rate, 755.1552);
  assert.equal(result.effectiveDate, '2026-08-05');
  assert.equal(result.status, 'cached');
});

test('client selection preserves a newer fetched copy of the same BCV announcement', () => {
  const network = {
    rate: 755.1552,
    effectiveDate: '2026-08-05',
    publishedAt: regression.updated_at,
    source: 'bcv.today',
    status: 'current',
    fetchedAt: '2026-08-05T03:13:00Z'
  };
  const cached = { ...network, fetchedAt: '2026-08-05T03:14:00Z' };
  const selected = selectNewestBcvRecord(network, cached, { now: tuesdayNightUtc });
  assert.equal(selected.updated, false);
  assert.equal(selected.record.fetchedAt, cached.fetchedAt);
});

test('rejects a BCV response with the wrong content type', async () => {
  await assert.rejects(resolveBcvRate({
    fetchImpl: async () => response({}, { headers: { 'content-type': 'text/html' } }),
    now: () => tuesdayNightUtc
  }), /contenido/);
});

test('uses a fresh five-minute cache without requesting the large history', async () => {
  let calls = 0;
  const result = await resolveBcvRate({
    cachedRecord: {
      rate: 755.1552,
      effectiveDate: '2026-08-05',
      publishedAt: regression.updated_at,
      source: 'bcv.today',
      status: 'announced',
      fetchedAt: '2026-08-05T03:14:00Z'
    },
    fetchImpl: async () => { calls += 1; return response([]); },
    now: () => tuesdayNightUtc
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'cached');
});

test('marks a preserved record as cached or stale after a refresh failure', () => {
  const stored = {
    rate: 755.1552,
    effectiveDate: '2026-08-05',
    publishedAt: regression.updated_at,
    source: 'bcv.today',
    status: 'announced',
    fetchedAt: '2026-08-05T03:14:00Z'
  };
  assert.equal(markBcvRecordCached(stored, { now: tuesdayNightUtc }).status, 'cached');
  assert.equal(markBcvRecordCached(stored, { now: new Date('2026-08-07T03:15:22Z') }).status, 'stale');
});

test('reports a network timeout when no fallback is available', async () => {
  const hangingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(resolveBcvRate({
    fetchImpl: hangingFetch,
    now: () => tuesdayNightUtc,
    timeoutMs: 5
  }), { name: 'AbortError' });
});

test('uses America/Caracas near UTC midnight for announced/current status', () => {
  const beforeMidnightCaracas = new Date('2026-08-05T03:59:00Z');
  const afterMidnightCaracas = new Date('2026-08-05T04:01:00Z');
  assert.equal(getCaracasDate(beforeMidnightCaracas), '2026-08-04');
  assert.equal(getCaracasDate(afterMidnightCaracas), '2026-08-05');
  assert.equal(normalizeHistoryRecord(regression, { now: beforeMidnightCaracas }).status, 'announced');
  assert.equal(normalizeHistoryRecord(regression, { now: afterMidnightCaracas }).status, 'current');
});

test('formats compact effective-date labels without changing the rate', () => {
  const announced = normalizeHistoryRecord(regression, { now: tuesdayNightUtc });
  assert.equal(formatBcvRateLabel(announced, { now: tuesdayNightUtc }), 'Tasa anunciada · Vigente 5 ago');
  assert.equal(formatBcvRateLabel({ ...announced, status: 'current' }, {
    now: new Date('2026-08-05T12:00:00-04:00')
  }), 'BCV vigente hoy');
  assert.equal(announced.rate, 755.1552);
});

test('uses full BCV precision in calculations', () => {
  assert.equal(currentBankRate(755.1552, 0.5), 755.1552 * 1.005);
});
