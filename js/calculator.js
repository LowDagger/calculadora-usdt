import { n } from './utils.js';

const DECIMAL_SCALE = 1_000_000n;
const PERCENT_FACTOR_SCALE = 100n * DECIMAL_SCALE;
const UNITS_PER_CENT = 10_000n;
const MAX_CORRECTIONS = 100;
export const MAX_REQUESTED_USD = 1_000_000;
export const DEFAULT_BPAY_FEE = 4.1;

const REQUESTED_USD_PATTERN = /^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/;

export function sanitizeRequestedUsdInput(value) {
  const source = String(value ?? '').trim();
  if (!source) return '';

  // Invalid pasted/autofilled content is discarded instead of being coerced
  // into a different number (for example, "1e3" must not become "13").
  if (/[^\d.,]/.test(source)) return '';

  const normalized = source.replace(/,/g, '.');
  if ((normalized.match(/\./g) || []).length > 1) return '';

  const hasDecimal = normalized.includes('.');
  const [rawWhole = '', rawFraction = ''] = normalized.split('.');
  const whole = (rawWhole || '0').replace(/^0+(?=\d)/, '');

  if (!hasDecimal) return whole;
  return `${whole}.${rawFraction.slice(0, 2)}`;
}

export class MoneyValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MoneyValidationError';
  }
}

export function validateRequestedUsd(value) {
  const source = String(value ?? '').trim();

  if (!source) return { value: null, error: '' };
  if (!REQUESTED_USD_PATTERN.test(source)) {
    return { value: null, error: 'Usa solo números y hasta 2 decimales.' };
  }

  const parsed = Number(source.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    return { value: null, error: 'Ingresa un monto válido.' };
  }
  if (parsed <= 0) {
    return { value: null, error: 'El monto debe ser mayor que 0.' };
  }
  if (parsed > MAX_REQUESTED_USD) {
    return { value: null, error: 'El máximo por cálculo es 1.000.000,00 USD.' };
  }

  return { value: parsed, error: '' };
}

function parseFixed(value, label) {
  const source = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(source)) {
    throw new MoneyValidationError(`${label} debe ser un decimal válido.`);
  }
  const [whole, fraction = ''] = source.split('.');
  return BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(6, '0'));
}

function unitsToNumber(units) {
  return Number(units) / Number(DECIMAL_SCALE);
}

function centsToNumber(cents) {
  return Number(cents) / 100;
}

export function floorToCurrencyCents(value) {
  return centsToNumber(parseFixed(value, 'El monto') / UNITS_PER_CENT);
}

/** Models the observed bank behavior of dropping fractions below one cent. */
export function settleBankChargeByFlooring(merchantCents, bankFeeUnits) {
  return (merchantCents * (PERCENT_FACTOR_SCALE + bankFeeUnits)) / PERCENT_FACTOR_SCALE;
}

export function calculateSafeGatewayAmount({
  cardBalance,
  bankFeePercent,
  gatewayFeePercent,
  targetMargin
}) {
  const balanceUnits = parseFixed(cardBalance, 'El saldo de la tarjeta');
  const marginUnits = parseFixed(targetMargin, 'El margen');
  const bankFeeUnits = parseFixed(bankFeePercent, 'La comisión bancaria');
  const gatewayFeeUnits = parseFixed(gatewayFeePercent, 'La comisión de BPay');

  if (balanceUnits <= 0n) throw new MoneyValidationError('El saldo debe ser mayor que cero.');
  if (marginUnits > balanceUnits) throw new MoneyValidationError('El margen no puede superar el saldo.');
  if (gatewayFeeUnits >= 100n * DECIMAL_SCALE) {
    throw new MoneyValidationError('La comisión de BPay debe ser menor que 100%.');
  }

  const allowedUnits = balanceUnits - marginUnits;
  const bankFactor = PERCENT_FACTOR_SCALE + bankFeeUnits;
  let merchantCents = (allowedUnits * PERCENT_FACTOR_SCALE / bankFactor) / UNITS_PER_CENT;
  let expectedDeductionCents = settleBankChargeByFlooring(merchantCents, bankFeeUnits);
  let corrections = 0;

  while (expectedDeductionCents * UNITS_PER_CENT > allowedUnits) {
    if (merchantCents === 0n || corrections >= MAX_CORRECTIONS) {
      throw new MoneyValidationError('No se pudo obtener un monto seguro con estos valores.');
    }
    merchantCents -= 1n;
    expectedDeductionCents = settleBankChargeByFlooring(merchantCents, bankFeeUnits);
    corrections += 1;
  }

  const rawDeductionNumerator = merchantCents * (PERCENT_FACTOR_SCALE + bankFeeUnits);
  const rawDeductionUnits = rawDeductionNumerator * UNITS_PER_CENT / PERCENT_FACTOR_SCALE;
  const remainingUnits = balanceUnits - expectedDeductionCents * UNITS_PER_CENT;
  const gatewayNumerator = merchantCents * (PERCENT_FACTOR_SCALE - gatewayFeeUnits);
  const netCents = (gatewayNumerator + PERCENT_FACTOR_SCALE / 2n) / PERCENT_FACTOR_SCALE;

  return {
    bpayInputAmount: centsToNumber(merchantCents),
    rawBankDeduction: unitsToNumber(rawDeductionUnits),
    expectedBankDeduction: centsToNumber(expectedDeductionCents),
    projectedRemainingBalance: unitsToNumber(remainingUnits),
    netToBinance: centsToNumber(netCents),
    allowedBankSpend: unitsToNumber(allowedUnits),
    safetyCorrections: corrections
  };
}

export function currentBankRate(bcvRate, bankMargin) {
  return n(bcvRate) * (1 + n(bankMargin) / 100);
}

export function calculateValues({ requestedUsd, bcvRate, bankMargin, p2pRate, cardFee, bpayFee }) {
  const amountValidation = validateRequestedUsd(requestedUsd);
  const requested = amountValidation.value;
  const bcv = n(bcvRate);
  const bank = currentBankRate(bcv, bankMargin);
  const p2p = n(p2pRate);
  const cardPct = n(cardFee);
  const bpayPct = n(bpayFee);

  if (requested === null || !bcv || !p2p || cardPct < 0 || bpayPct < 0 || bpayPct >= 100) return null;

  const safeGateway = calculateSafeGatewayAmount({
    cardBalance: requested,
    bankFeePercent: cardFee,
    gatewayFeePercent: bpayFee,
    targetMargin: '0.01'
  });
  const usdUsed = requested;
  const vesNeeded = usdUsed * bank;
  const afterCard = safeGateway.bpayInputAmount;
  const cardFeeUsd = safeGateway.expectedBankDeduction - afterCard;
  const bpayFeeUsd = afterCard - safeGateway.netToBinance;
  const usdtFinal = safeGateway.netToBinance;
  const vesReturn = usdtFinal * p2p;
  const profitVes = vesReturn - vesNeeded;
  const profitUsdt = profitVes / p2p;
  const roi = vesNeeded ? (profitVes / vesNeeded) * 100 : 0;
  const totalFeesUsd = cardFeeUsd + bpayFeeUsd;

  return {
    requestedUsd: requested, bcv, bank, p2p, cardPct, bpayPct,
    usdUsed, vesNeeded, cardFeeUsd, afterCard, bpayFeeUsd,
    usdtFinal, vesReturn, profitVes, profitUsdt, roi, totalFeesUsd,
    safeGateway
  };
}
