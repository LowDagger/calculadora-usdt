import { n } from './utils.js';

export function currentBankRate(bcvRate, bankMargin) {
  return n(bcvRate) * (1 + n(bankMargin) / 100);
}

export function calculateValues({ requestedUsd, limitUsd, bcvRate, bankMargin, p2pRate, cardFee, bpayFee }) {
  const requested = n(requestedUsd);
  const limit = n(limitUsd) || 1000;  // Default limit is 1000 USD
  const bcv = n(bcvRate);
  const bank = currentBankRate(bcv, bankMargin);
  const p2p = n(p2pRate);
  const cardPct = n(cardFee);
  const bpayPct = n(bpayFee);

  if (!requested || !bcv || !p2p) return null;

  const usdUsed = Math.min(requested, limit);
  const usdBlocked = Math.max(0, requested - limit);
  const vesNeeded = usdUsed * bank;
  const cardFeeUsd = usdUsed * (cardPct / 100);
  const afterCard = usdUsed - cardFeeUsd;
  const bpayFeeUsd = afterCard * (bpayPct / 100);
  const usdtFinal = afterCard - bpayFeeUsd;
  const vesReturn = usdtFinal * p2p;
  const profitVes = vesReturn - vesNeeded;
  const profitUsdt = profitVes / p2p;
  const roi = vesNeeded ? (profitVes / vesNeeded) * 100 : 0;
  const totalFeesUsd = cardFeeUsd + bpayFeeUsd;

  return {
    requestedUsd: requested, limitUsd: limit, bcv, bank, p2p, cardPct, bpayPct,
    usdUsed, usdBlocked, vesNeeded, cardFeeUsd, afterCard, bpayFeeUsd,
    usdtFinal, vesReturn, profitVes, profitUsdt, roi, totalFeesUsd
  };
}
