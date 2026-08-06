import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRateStatistics, USER_DIRECTIONS } from '../services/rateStatistics.mjs';

const fixedNow = () => new Date('2026-08-04T12:00:00.000Z');

function calculate(prices, userDirection = USER_DIRECTIONS.USER_BUYS_USDT) {
  return calculateRateStatistics({
    advertisements: prices.map(price => ({ price })),
    asset: 'USDT',
    fiat: 'VES',
    userDirection,
    now: fixedNow
  });
}

test('calculates odd and even medians correctly', () => {
  assert.equal(calculate([5, 1, 3]).overallMedian, 3);
  assert.equal(calculate([4, 1, 3, 2]).overallMedian, 2.5);
});

test('uses ascending prices when the user buys USDT', () => {
  const result = calculate([103, 100, 101, 102]);
  assert.equal(result.bestValidPrice, 100);
  assert.equal(result.top3Median, 101);
  assert.equal(result.top3Mean, 101);
});

test('uses descending prices when the user sells USDT', () => {
  const result = calculate([103, 100, 101, 102], USER_DIRECTIONS.USER_SELLS_USDT);
  assert.equal(result.bestValidPrice, 103);
  assert.equal(result.top3Median, 102);
  assert.equal(result.top3Mean, 102);
});

test('handles fewer than three or five valid offers', () => {
  const result = calculate([10, 20]);
  assert.equal(result.top3Median, 15);
  assert.equal(result.top5Median, 15);
  assert.equal(result.top3Mean, 15);
  assert.equal(result.top5Mean, 15);
});

test('ignores invalid prices and reports an empty sample honestly', () => {
  const result = calculateRateStatistics({
    advertisements: [{ price: NaN }, { price: Infinity }, { price: 0 }, { price: -1 }],
    asset: 'USDT', fiat: 'VES', userDirection: USER_DIRECTIONS.USER_BUYS_USDT, now: fixedNow
  });
  assert.equal(result.validOfferCount, 0);
  assert.equal(result.bestValidPrice, null);
  assert.equal(result.minimumPrice, null);
  assert.equal(result.calculatedAt, '2026-08-04T12:00:00.000Z');
});
