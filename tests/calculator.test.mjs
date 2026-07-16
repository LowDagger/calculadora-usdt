import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MoneyValidationError,
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
    cardBalance: '500.04', bankFeePercent: '1.5', gatewayFeePercent: '4.1', targetMargin: '0.03'
  });
  assert.deepEqual(result, {
    bpayInputAmount: 492.62,
    rawBankDeduction: 500.0093,
    expectedBankDeduction: 500,
    projectedRemainingBalance: 0.04,
    netToBinance: 472.42,
    allowedBankSpend: 500.01,
    safetyCorrections: 0
  });
  assertSafe(result);
});

test('zero bank fee preserves the target margin', () => {
  const result = calculateSafeGatewayAmount({
    cardBalance: '100.00', bankFeePercent: '0', gatewayFeePercent: '4.1', targetMargin: '0.03'
  });
  assert.equal(result.bpayInputAmount, 99.97);
  assert.equal(result.expectedBankDeduction, 99.97);
  assert.equal(result.projectedRemainingBalance, 0.03);
  assert.equal(result.netToBinance, 95.87);
  assertSafe(result);
});

test('zero gateway fee returns the merchant amount unchanged', () => {
  const result = calculateSafeGatewayAmount({
    cardBalance: '100.00', bankFeePercent: '1.5', gatewayFeePercent: '0', targetMargin: '0.03'
  });
  assert.equal(result.netToBinance, result.bpayInputAmount);
  assertSafe(result);
});

test('handles exact cents, tiny balances, and decimal traps deterministically', () => {
  for (const cardBalance of ['0.05', '0.1', '0.2', '1.005', '10.075']) {
    const result = calculateSafeGatewayAmount({
      cardBalance, bankFeePercent: '0', gatewayFeePercent: '0', targetMargin: '0.03'
    });
    assertSafe(result);
  }
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
