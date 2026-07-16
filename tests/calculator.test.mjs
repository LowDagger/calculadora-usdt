import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MoneyValidationError,
  calculateValues,
  calculateSafeGatewayAmount,
  floorToCurrencyCents
} from '../js/calculator.js';

function assertSafe(result) {
  assert.ok(result.expectedBankDeduction <= result.allowedBankSpend);
  assert.ok(result.safetyCorrections <= 100);
}

test('strictly floors merchant amounts without floating-point rounding', () => {
  assert.equal(floorToCurrencyCents('492.7389'), 492.73);
  assert.equal(floorToCurrencyCents('492.7300'), 492.73);
  assert.equal(floorToCurrencyCents('0.039'), 0.03);
  assert.equal(floorToCurrencyCents('100.999'), 100.99);
  assert.equal(floorToCurrencyCents('1.005'), 1);
  assert.equal(floorToCurrencyCents('10.075'), 10.07);
});

test('observed settlement scenario applies fees sequentially', () => {
  const result = calculateSafeGatewayAmount({
    cardBalance: '500.04', bankFeePercent: '1.5', gatewayFeePercent: '4.1', targetMargin: '0.01'
  });
  assert.deepEqual(result, {
    bpayInputAmount: 492.64,
    rawBankDeduction: 500.0296,
    expectedBankDeduction: 500.02,
    projectedRemainingBalance: 0.02,
    netToBinance: 472.44,
    allowedBankSpend: 500.03,
    safetyCorrections: 0
  });
  assertSafe(result);
});

test('zero bank fee preserves the target margin', () => {
  const result = calculateSafeGatewayAmount({
    cardBalance: '100.00', bankFeePercent: '0', gatewayFeePercent: '4.1', targetMargin: '0.01'
  });
  assert.equal(result.bpayInputAmount, 99.99);
  assert.equal(result.expectedBankDeduction, 99.99);
  assert.equal(result.projectedRemainingBalance, 0.01);
  assert.equal(result.netToBinance, 95.89);
  assertSafe(result);
});

test('zero gateway fee returns the merchant amount unchanged', () => {
  const result = calculateSafeGatewayAmount({
    cardBalance: '100.00', bankFeePercent: '1.5', gatewayFeePercent: '0', targetMargin: '0.01'
  });
  assert.equal(result.netToBinance, result.bpayInputAmount);
  assertSafe(result);
});

test('handles exact cents, tiny balances, and decimal traps deterministically', () => {
  for (const cardBalance of ['0.05', '0.1', '0.2', '1.005', '10.075']) {
    const result = calculateSafeGatewayAmount({
      cardBalance, bankFeePercent: '0', gatewayFeePercent: '0', targetMargin: '0.01'
    });
    assertSafe(result);
  }
});

test('integrated 500 USD flow keeps sequential fees, profit, and ROI consistent', () => {
  const result = calculateValues({
    requestedUsd: '500',
    bcvRate: '727.4512',
    bankMargin: '0.5',
    p2pRate: '849.9495',
    cardFee: '2.5',
    bpayFee: '4.1'
  });
  assert.equal(result.safeGateway.bpayInputAmount, 487.79);
  assert.equal(result.safeGateway.expectedBankDeduction, 499.98);
  assert.equal(result.usdtFinal, 467.79);
  assert.equal(result.totalFeesUsd, 32.19);
  assert.ok(result.safeGateway.expectedBankDeduction <= 499.99);
  assert.ok(Math.abs(result.vesNeeded - 365544.228) < 1e-9);
  assert.equal(result.profitVes, result.vesReturn - result.vesNeeded);
  assert.equal(result.roi, (result.profitVes / result.vesNeeded) * 100);
});

test('rejects invalid financial inputs with a controlled domain error', () => {
  const invalidCases = [
    { cardBalance: '', bankFeePercent: '1', gatewayFeePercent: '1', targetMargin: '0' },
    { cardBalance: '-1', bankFeePercent: '1', gatewayFeePercent: '1', targetMargin: '0' },
    { cardBalance: '1', bankFeePercent: '-1', gatewayFeePercent: '1', targetMargin: '0' },
    { cardBalance: '1', bankFeePercent: '1', gatewayFeePercent: '100', targetMargin: '0' },
    { cardBalance: '1', bankFeePercent: '1', gatewayFeePercent: '1', targetMargin: '2' },
    { cardBalance: 'Infinity', bankFeePercent: '1', gatewayFeePercent: '1', targetMargin: '0' }
  ];
  for (const values of invalidCases) {
    assert.throws(() => calculateSafeGatewayAmount(values), MoneyValidationError);
  }
});
