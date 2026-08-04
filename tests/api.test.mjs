import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRates, DOLARAPI_RATES } from '../js/api.js';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

const official = {
  moneda: 'USD', fuente: 'oficial', promedio: 752.0943,
  fechaActualizacion: '2026-08-04T00:00:00-04:00'
};
const parallel = {
  moneda: 'USD', fuente: 'paralelo', promedio: 832.179421,
  fechaActualizacion: '2026-08-04T16:01:44.835Z'
};

function response(body, { ok = true, status = 200, invalidJson = false } = {}) {
  return { ok, status, json: async () => invalidJson ? Promise.reject(new SyntaxError('JSON')) : body };
}

async function withFetch(mock, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await fn(); } finally { globalThis.fetch = previous; }
}

test('maps a successful combined response and passes required fetch options', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, DOLARAPI_RATES);
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return response([official, parallel]);
  }, async () => {
    assert.deepEqual(await fetchRates(), {
      bcv: 752.0943, p2p: 832.179421,
      bcvEffectiveDate: official.fechaActualizacion,
      p2pUpdatedAt: parallel.fechaActualizacion
    });
  });
});

test('maps by normalized fuente rather than array position', async () => {
  await withFetch(async () => response([
    { ...parallel, fuente: ' PARALELO ', moneda: ' usd ' },
    { ...official, fuente: 'OFICIAL', moneda: 'USD' }
  ]), async () => assert.deepEqual((await fetchRates()).bcv, official.promedio));
});

test('accepts finite positive numeric strings', async () => {
  await withFetch(async () => response([
    { ...official, promedio: '752.0943' }, { ...parallel, promedio: '832.179421' }
  ]), async () => assert.deepEqual(await fetchRates(), {
    bcv: 752.0943, p2p: 832.179421,
    bcvEffectiveDate: official.fechaActualizacion,
    p2pUpdatedAt: parallel.fechaActualizacion
  }));
});

const failures = [
  ['missing official entry', [parallel], /oficial USD/],
  ['missing parallel entry', [official], /paralela USD/],
  ['invalid official promedio', [{ ...official, promedio: 'x' }, parallel], /oficial no válida/],
  ['invalid parallel promedio', [official, { ...parallel, promedio: 'x' }], /paralela no válida/],
  ['missing official date', [{ ...official, fechaActualizacion: undefined }, parallel], /fecha.*oficial/],
  ['invalid parallel date', [official, { ...parallel, fechaActualizacion: 'not-a-date' }], /fecha.*paralela/]
];
for (const [name, body, pattern] of failures) {
  test(name, async () => withFetch(async () => response(body),
    async () => assert.rejects(fetchRates(), pattern)));
}

for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
  test(`rejects invalid rate value ${String(invalid)}`, async () =>
    withFetch(async () => response([{ ...official, promedio: invalid }, parallel]),
      async () => assert.rejects(fetchRates(), /oficial no válida/)));
}

test('rejects invalid JSON', async () => withFetch(async () => response(null, { invalidJson: true }),
  async () => assert.rejects(fetchRates(), SyntaxError)));
test('rejects a non-array response', async () => withFetch(async () => response({}),
  async () => assert.rejects(fetchRates(), /no es una lista/)));
test('rejects an HTTP error', async () => withFetch(async () => response(null, { ok: false, status: 503 }),
  async () => assert.rejects(fetchRates(), /HTTP 503/)));
test('preserves a network error', async () => withFetch(async () => { throw new TypeError('offline'); },
  async () => assert.rejects(fetchRates(), /offline/)));

test('aborts after the timeout and clears the timer', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  let cleared = false;
  globalThis.setTimeout = fn => { queueMicrotask(fn); return 99; };
  globalThis.clearTimeout = id => { assert.equal(id, 99); cleared = true; };
  try {
    await withFetch((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }), async () => assert.rejects(fetchRates(), { name: 'AbortError' }));
    assert.equal(cleared, true);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});

test('the UI only overwrites both rates after the complete request succeeds', () => {
  const tryBlock = appSource.match(/try \{([\s\S]*?)\} catch \(err\) \{([\s\S]*?)\} finally/);
  assert.ok(tryBlock);
  assert.match(tryBlock[1], /await fetchRates\(\)[\s\S]*els\.bcvRate\.value[\s\S]*els\.p2pRate\.value/);
  assert.doesNotMatch(tryBlock[2], /\.value\s*=/);
  assert.match(tryBlock[2], /Conservando valores guardados/);
});
