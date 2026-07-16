import { n } from './utils.js';

const DECIMAL_SCALE = 1_000_000n;
const PERCENT_FACTOR_SCALE = 100n * DECIMAL_SCALE;
const UNITS_PER_CENT = 10_000n;
const MAX_CORRECTIONS = 100;

export class MoneyValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MoneyValidationError';
  }
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
  const requested = n(requestedUsd);
  const bcv = n(bcvRate);
  const bank = currentBankRate(bcv, bankMargin);
  const p2p = n(p2pRate);
  const cardPct = n(cardFee);
  const bpayPct = n(bpayFee);

  if (requestedUsd === '' || requestedUsd === null || requestedUsd === undefined || requested <= 0 || !bcv || !p2p || cardPct < 0 || bpayPct < 0 || bpayPct >= 100) return null;

  const safeGateway = calculateSafeGatewayAmount({
    cardBalance: requestedUsd,
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
