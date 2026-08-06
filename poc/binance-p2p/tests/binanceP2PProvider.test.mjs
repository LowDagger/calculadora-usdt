import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBinanceP2PProvider,
  P2PProviderError,
  validateP2PRequest
} from '../providers/binanceP2PProvider.mjs';
import { USER_DIRECTIONS } from '../services/rateStatistics.mjs';

function advertisement(overrides = {}) {
  return {
    adv: {
      price: '100.50',
      surplusAmount: '50',
      minSingleTransAmount: '10',
      maxSingleTransAmount: '1000',
      tradeMethods: [{ identifier: 'BANK', tradeMethodName: 'Bank Transfer' }],
      ...overrides.adv
    },
    advertiser: {
      nickName: 'merchant-1',
      userType: 'merchant',
      monthFinishRate: 0.98,
      monthOrderCount: 200,
      ...overrides.advertiser
    }
  };
}

function response(body, init = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), init);
}

function provider(fetchImpl, options = {}) {
  return createBinanceP2PProvider({
    fetchImpl,
    retries: 0,
    cacheTtlMs: 0,
    retryBaseDelayMs: 0,
    ...options
  });
}

const request = { fiat: 'ves', asset: 'usdt', userDirection: USER_DIRECTIONS.USER_BUYS_USDT };

test('normalizes request codes and a valid response', async () => {
  let sent;
  const getRates = provider(async (_url, options) => {
    sent = JSON.parse(options.body);
    return response({ data: [advertisement()] });
  });
  const result = await getRates(request);
  assert.equal(sent.asset, 'USDT');
  assert.equal(sent.fiat, 'VES');
  assert.equal(sent.tradeType, 'BUY');
  assert.deepEqual(result.advertisements[0], {
    price: 100.5,
    availableAmount: 50,
    minTransactionAmount: 10,
    maxTransactionAmount: 1000,
    advertiserName: 'merchant-1',
    merchantType: 'merchant',
    completionRate: 0.98,
    completedOrders: 200,
    paymentMethods: ['BANK', 'Bank Transfer']
  });
});

test('accepts an empty advertisement list', async () => {
  const result = await provider(async () => response({ data: [] }))(request);
  assert.equal(result.returnedAdvertisementCount, 0);
  assert.deepEqual(result.advertisements, []);
});

test('rejects malformed JSON and unexpected schemas', async () => {
  await assert.rejects(provider(async () => response('{'))(request), { code: 'UPSTREAM_MALFORMED_JSON' });
  await assert.rejects(provider(async () => response({ data: {} }))(request), { code: 'UPSTREAM_UNEXPECTED_SCHEMA' });
});

for (const [status, code, retryable] of [
  [429, 'UPSTREAM_RATE_LIMITED', true],
  [403, 'UPSTREAM_FORBIDDEN', false],
  [500, 'UPSTREAM_UNAVAILABLE', true]
]) {
  test(`returns a structured error for HTTP ${status}`, async () => {
    await assert.rejects(
      provider(async () => response({}, { status, headers: { 'retry-after': '1' } }))(request),
      error => error instanceof P2PProviderError && error.code === code && error.retryable === retryable && error.status === status
    );
  });
}

test('reports timeout and network failures', async () => {
  const timeoutFetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(provider(timeoutFetch, { timeoutMs: 5 })(request), { code: 'UPSTREAM_TIMEOUT' });
  await assert.rejects(provider(async () => { throw new Error('DNS failed'); })(request), { code: 'UPSTREAM_NETWORK_ERROR' });
});

test('drops invalid numeric prices instead of fabricating rates', async () => {
  const data = ['NaN', 'Infinity', '0', '-1', ''].map(price => advertisement({ adv: { price } }));
  const result = await provider(async () => response({ data }))(request);
  assert.equal(result.returnedAdvertisementCount, 5);
  assert.deepEqual(result.advertisements, []);
});

test('keeps valid offers when optional advertiser fields are missing', async () => {
  const result = await provider(async () => response({
    data: [advertisement({ advertiser: { nickName: undefined, userType: undefined, monthFinishRate: undefined, monthOrderCount: undefined } })]
  }))(request);
  assert.equal(result.advertisements[0].price, 100.5);
  assert.equal(result.advertisements[0].advertiserName, null);
  assert.equal(result.advertisements[0].completionRate, null);
});

test('filters offers incompatible with a transaction amount', async () => {
  const data = [
    advertisement({ adv: { price: '100', minSingleTransAmount: '10', maxSingleTransAmount: '50' } }),
    advertisement({ adv: { price: '101', minSingleTransAmount: '50', maxSingleTransAmount: '150' } })
  ];
  const result = await provider(async () => response({ data }))({ ...request, transAmount: 100 });
  assert.deepEqual(result.advertisements.map(item => item.price), [101]);
});

test('applies documented quality and payment filters conservatively', async () => {
  const data = [
    advertisement(),
    advertisement({ adv: { price: '101', tradeMethods: [{ tradeMethodName: 'Cash' }] }, advertiser: { userType: 'user', monthFinishRate: 0.8, monthOrderCount: 2 } })
  ];
  const result = await provider(async () => response({ data }))({
    ...request,
    payTypes: ['Bank Transfer'],
    merchantOnly: true,
    minimumCompletionRate: 0.9,
    minimumCompletedOrders: 100
  });
  assert.deepEqual(result.advertisements.map(item => item.price), [100.5]);
});

test('retries only eligible transient failures', async () => {
  let transientCalls = 0;
  const transient = provider(async () => {
    transientCalls += 1;
    return transientCalls < 3 ? response({}, { status: 500 }) : response({ data: [] });
  }, { retries: 2, sleep: async () => {} });
  await transient(request);
  assert.equal(transientCalls, 3);

  let forbiddenCalls = 0;
  const forbidden = provider(async () => {
    forbiddenCalls += 1;
    return response({}, { status: 403 });
  }, { retries: 2, sleep: async () => {} });
  await assert.rejects(forbidden(request), { code: 'UPSTREAM_FORBIDDEN' });
  assert.equal(forbiddenCalls, 1);
});

test('validates malformed values before making a request', () => {
  assert.throws(() => validateP2PRequest({ ...request, rows: 21 }), { code: 'INVALID_REQUEST' });
  assert.throws(() => validateP2PRequest({ ...request, fiat: 'VE$' }), { code: 'INVALID_REQUEST' });
  assert.throws(() => validateP2PRequest({ ...request, transAmount: 'Infinity' }), { code: 'INVALID_REQUEST' });
  assert.throws(() => validateP2PRequest({ ...request, transAmount: '1e3' }), { code: 'INVALID_REQUEST' });
  assert.throws(() => validateP2PRequest({ ...request, payTypes: [''] }), { code: 'INVALID_REQUEST' });
  assert.throws(() => validateP2PRequest({ ...request, tradeType: 'SELL' }), { code: 'INVALID_REQUEST' });
});

test('serves identical short-lived requests from the local cache', async () => {
  let calls = 0;
  const getRates = provider(async () => {
    calls += 1;
    return response({ data: [] });
  }, { cacheTtlMs: 1000, now: () => 100 });
  assert.equal((await getRates(request)).cached, false);
  assert.equal((await getRates(request)).cached, true);
  assert.equal(calls, 1);
});
