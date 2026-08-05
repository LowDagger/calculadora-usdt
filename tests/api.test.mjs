import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchRates, DOLARAPI_RATES } from '../js/api.js';
import { BCV_CURRENT_URL, BCV_HISTORY_URL } from '../js/bcv-rates.js';

const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const announced = JSON.parse(readFileSync(new URL('./fixtures/bcv-2026-08-05.json', import.meta.url), 'utf8'));
const now = () => new Date('2026-08-05T03:15:22.230Z');
const official = {
  moneda: 'USD', fuente: 'oficial', promedio: 752.0943,
  fechaActualizacion: '2026-08-04T00:00:00-04:00'
};
const parallel = {
  moneda: 'USD', fuente: 'paralelo', promedio: 832.179421,
  fechaActualizacion: '2026-08-04T16:01:44.835Z'
};

function response(body, init = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), init);
}

function successfulFetch({ history = [announced], current = official } = {}) {
  return async url => {
    if (url === DOLARAPI_RATES) return response([official, parallel]);
    if (url === BCV_HISTORY_URL) return response(history);
    if (url === BCV_CURRENT_URL) return response(current);
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test('combines the latest announced BCV rate with DolarAPI P2P atomically', async () => {
  const result = await fetchRates({ fetchImpl: successfulFetch(), now });
  assert.equal(result.bcv, 755.1552);
  assert.equal(result.p2p, 832.179421);
  assert.equal(result.bcvEffectiveDate, '2026-08-05');
  assert.equal(result.bcvPublishedAt, announced.updated_at);
  assert.equal(result.bcvSource, 'bcv.today');
  assert.equal(result.bcvStatus, 'announced');
  assert.equal(result.p2pUpdatedAt, parallel.fechaActualizacion);
});

test('maps DolarAPI P2P by normalized fuente rather than array position', async () => {
  const fetchImpl = async url => {
    if (url === DOLARAPI_RATES) return response([
      { ...parallel, fuente: ' PARALELO ', moneda: ' usd ' },
      { ...official, fuente: 'OFICIAL' }
    ]);
    return response([announced]);
  };
  assert.equal((await fetchRates({ fetchImpl, now })).p2p, parallel.promedio);
});

test('accepts a missing DolarAPI official entry when BCV Today succeeds', async () => {
  const fetchImpl = async url => url === DOLARAPI_RATES
    ? response([parallel])
    : response([announced]);
  assert.equal((await fetchRates({ fetchImpl, now })).bcv, 755.1552);
});

test('falls back to DolarAPI official only after both BCV Today endpoints fail', async () => {
  const fetchImpl = async url => url === DOLARAPI_RATES
    ? response([official, parallel])
    : response({}, { status: 503 });
  const result = await fetchRates({ fetchImpl, now });
  assert.equal(result.bcv, 752.0943);
  assert.equal(result.bcvSource, 'dolarapi.com.ve');
  assert.equal(result.bcvStatus, 'cached');
});

test('uses rate.json after an empty history response', async () => {
  const current = {
    USD: 752.0943,
    updated_at: '2026-08-03T18:03:53.463227-04:00',
    effective_date: '2026-08-04',
    date: '2026-08-04'
  };
  const result = await fetchRates({ fetchImpl: successfulFetch({ history: [], current }), now });
  assert.equal(result.bcv, 752.0943);
  assert.equal(result.bcvSource, 'bcv.today');
});

for (const [name, data, pattern] of [
  ['missing parallel entry', [official], /paralela USD/],
  ['invalid parallel promedio', [official, { ...parallel, promedio: -1 }], /paralela no válida/],
  ['invalid parallel date', [official, { ...parallel, fechaActualizacion: 'not-a-date' }], /fecha.*paralela/]
]) {
  test(name, async () => {
    const fetchImpl = async url => url === DOLARAPI_RATES ? response(data) : response([announced]);
    await assert.rejects(fetchRates({ fetchImpl, now }), pattern);
  });
}

test('rejects malformed DolarAPI JSON and HTTP errors', async () => {
  await assert.rejects(fetchRates({ fetchImpl: async () => response('{'), now }), SyntaxError);
  await assert.rejects(fetchRates({ fetchImpl: async () => response({}, { status: 503 }), now }), /HTTP 503/);
});

test('preserves a DolarAPI network error because P2P is required', async () => {
  await assert.rejects(fetchRates({ fetchImpl: async () => { throw new TypeError('offline'); }, now }), /offline/);
});

test('aborts a timed-out DolarAPI request and clears the timer', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  let cleared = false;
  globalThis.setTimeout = fn => { queueMicrotask(fn); return 99; };
  globalThis.clearTimeout = id => { assert.equal(id, 99); cleared = true; };
  try {
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await assert.rejects(fetchRates({ fetchImpl, now }), { name: 'AbortError' });
    assert.equal(cleared, true);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});

test('the UI preserves full BCV precision and applies both rates atomically', () => {
  const tryBlock = appSource.match(/try \{([\s\S]*?)\} catch \(err\) \{([\s\S]*?)\} finally/);
  assert.ok(tryBlock);
  assert.match(tryBlock[1], /await fetchRates\(\{ cachedBcv: activeBcvRecord \}\)/);
  assert.match(tryBlock[1], /els\.bcvRate\.value = String\(bcv\)/);
  assert.match(tryBlock[1], /els\.p2pRate\.value = p2p\.toFixed\(4\)/);
  assert.doesNotMatch(tryBlock[2], /\.value\s*=/);
  assert.match(tryBlock[2], /markBcvRecordCached\(activeBcvRecord\)[\s\S]*renderBcvDate\(activeBcvRecord\)/);
  assert.match(tryBlock[2], /Conservando valores guardados/);
});
