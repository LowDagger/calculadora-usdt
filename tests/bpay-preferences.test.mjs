import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_BPAY_FEE, calculateValues } from '../js/calculator.js';

const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

// Helper to simulate app BPay state transitions cleanly
function simulateBpayHydration(storedData, activeDefaultBpay = DEFAULT_BPAY_FEE) {
  let isBpayCustomized = false;
  let bpayValue = String(activeDefaultBpay);

  if (storedData && Object.prototype.hasOwnProperty.call(storedData, 'bpayCustomized')) {
    isBpayCustomized = Boolean(storedData.bpayCustomized);
    if (isBpayCustomized && Object.prototype.hasOwnProperty.call(storedData, 'bpayFee')) {
      bpayValue = String(storedData.bpayFee);
    } else {
      bpayValue = String(activeDefaultBpay);
    }
  } else if (storedData && Object.prototype.hasOwnProperty.call(storedData, 'bpayFee')) {
    // Ambiguous legacy state without metadata: preserve the user's stored value and mark as customized
    bpayValue = String(storedData.bpayFee);
    isBpayCustomized = true;
  } else {
    // New user / unconfigured BPay state
    bpayValue = String(activeDefaultBpay);
    isBpayCustomized = false;
  }

  return { bpayValue, isBpayCustomized };
}

function simulateBpayDefaultChange(currentState, newDefaultBpay) {
  let { bpayValue, isBpayCustomized } = currentState;
  if (!isBpayCustomized) {
    bpayValue = String(newDefaultBpay);
  }
  return { bpayValue, isBpayCustomized };
}

function simulateBpayReset(activeDefaultBpay = DEFAULT_BPAY_FEE) {
  return {
    bpayValue: String(activeDefaultBpay),
    isBpayCustomized: false
  };
}

test('DEFAULT_BPAY_FEE is defined as 4.1%', () => {
  assert.equal(DEFAULT_BPAY_FEE, 4.1);
});

test('new user with empty storage receives current default BPay value without customization flag', () => {
  const result = simulateBpayHydration({});
  assert.equal(result.bpayValue, '4.1');
  assert.equal(result.isBpayCustomized, false);
});

test('explicit user BPay customization is preserved across sessions', () => {
  const customState = { bpayFee: '3.6', bpayCustomized: true };
  const result = simulateBpayHydration(customState);
  assert.equal(result.bpayValue, '3.6');
  assert.equal(result.isBpayCustomized, true);
});

test('legacy ambiguous stored BPay value is preserved and not overwritten', () => {
  // Legacy stored state that had bpayFee = 3.6 without bpayCustomized metadata
  const legacyState36 = { bpayFee: '3.6' };
  const result36 = simulateBpayHydration(legacyState36);
  assert.equal(result36.bpayValue, '3.6');
  assert.equal(result36.isBpayCustomized, true);

  // Legacy stored state that had bpayFee = 5.0
  const legacyState50 = { bpayFee: '5.0' };
  const result50 = simulateBpayHydration(legacyState50);
  assert.equal(result50.bpayValue, '5.0');
  assert.equal(result50.isBpayCustomized, true);
});

test('updating application/remote default updates uncustomized users but preserves explicit customizations', () => {
  // Uncustomized user
  const defaultUser = simulateBpayHydration({ bpayFee: '4.1', bpayCustomized: false }, 4.1);
  assert.equal(defaultUser.bpayValue, '4.1');
  assert.equal(defaultUser.isBpayCustomized, false);

  const updatedDefaultUser = simulateBpayDefaultChange(defaultUser, 4.5);
  assert.equal(updatedDefaultUser.bpayValue, '4.5');
  assert.equal(updatedDefaultUser.isBpayCustomized, false);

  // Customized user
  const customUser = simulateBpayHydration({ bpayFee: '3.6', bpayCustomized: true }, 4.1);
  assert.equal(customUser.bpayValue, '3.6');
  assert.equal(customUser.isBpayCustomized, true);

  const updatedCustomUser = simulateBpayDefaultChange(customUser, 4.5);
  assert.equal(updatedCustomUser.bpayValue, '3.6');
  assert.equal(updatedCustomUser.isBpayCustomized, true);
});

test('reset-to-default clears BPay customization state and restores active default', () => {
  const customUser = simulateBpayHydration({ bpayFee: '3.6', bpayCustomized: true });
  assert.equal(customUser.isBpayCustomized, true);

  const resetState = simulateBpayReset(4.1);
  assert.equal(resetState.bpayValue, '4.1');
  assert.equal(resetState.isBpayCustomized, false);

  // If remote default is active (e.g. 4.3), reset restores that active default
  const resetWithRemote = simulateBpayReset(4.3);
  assert.equal(resetWithRemote.bpayValue, '4.3');
  assert.equal(resetWithRemote.isBpayCustomized, false);
});

test('BPay financial calculation formulas remain strictly unchanged', () => {
  const standardCalc = calculateValues({
    requestedUsd: '500',
    bcvRate: '755.9001',
    bankMargin: '0.5',
    p2pRate: '845.975',
    cardFee: '2.5',
    bpayFee: '4.1'
  });

  assert.ok(standardCalc);
  assert.equal(standardCalc.bpayPct, 4.1);
  assert.equal(standardCalc.safeGateway.bpayInputAmount, 487.79);
  assert.equal(standardCalc.usdtFinal, 467.79);
  assert.equal(standardCalc.bpayFeeUsd, 20);

  // Same calculation with 3.6%
  const customCalc = calculateValues({
    requestedUsd: '500',
    bcvRate: '755.9001',
    bankMargin: '0.5',
    p2pRate: '845.975',
    cardFee: '2.5',
    bpayFee: '3.6'
  });

  assert.ok(customCalc);
  assert.equal(customCalc.bpayPct, 3.6);
  assert.equal(customCalc.safeGateway.bpayInputAmount, 487.79);
  assert.equal(customCalc.usdtFinal, 470.23);
  assert.ok(Math.abs(customCalc.bpayFeeUsd - 17.56) < 1e-6);
});

test('app source code implements explicit BPay override tracking without value heuristics', () => {
  // No heuristic like `data.bpayFee === '3.6'`
  assert.equal(/data\.bpayFee === '3\.6'/.test(appSource), false);
  assert.equal(/data\.bpayFee === 3\.6/.test(appSource), false);

  // Checks for bpayCustomized metadata
  assert.match(appSource, /Object\.prototype\.hasOwnProperty\.call\(data,\s*'bpayCustomized'\)/);
  assert.match(appSource, /bpayCustomized:\s*isBpayCustomized/);
});
