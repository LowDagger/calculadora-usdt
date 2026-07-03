/**
 * js/api.js — Rate source: TasaVE only
 *
 * Fetches from the public endpoint — no API key required:
 *   GET https://tasave.sudelca.com/v1/rates
 *
 * Response fields used:
 *   bcv_usd        → BCV (official USD rate)
 *   parallel_usdt  → P2P/parallel (USDT mid-market, preferred)
 *   parallel_buy   → fallback if parallel_usdt is absent
 *   parallel_sell  → fallback if parallel_usdt is absent
 */

export const TASAVE_RATES = 'https://tasave.sudelca.com/v1/rates';

/**
 * Fetch BCV and P2P rates from TasaVE public endpoint.
 * Returns { bcv, p2p } or throws on network / parse error.
 */
export async function fetchRates() {
  const res = await fetch(TASAVE_RATES, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TasaVE: HTTP ${res.status}`);
  const data = await res.json();

  // BCV — official USD rate published by Banco Central de Venezuela
  const bcv = Number(data.bcv_usd);
  if (!Number.isFinite(bcv) || bcv <= 0) {
    throw new Error('TasaVE: tasa BCV no válida.');
  }

  // P2P / parallel — prefer the USDT mid-market rate
  // If absent, derive mid from buy+sell; last resort: use whichever side exists
  let p2p = Number(data.parallel_usdt);
  if (!Number.isFinite(p2p) || p2p <= 0) {
    const buy  = Number(data.parallel_buy);
    const sell = Number(data.parallel_sell);
    if (Number.isFinite(buy) && buy > 0 && Number.isFinite(sell) && sell > 0) {
      p2p = (buy + sell) / 2;          // derive mid from both sides
    } else if (Number.isFinite(sell) && sell > 0) {
      p2p = sell;                       // sell only
    } else if (Number.isFinite(buy) && buy > 0) {
      p2p = buy;                        // buy only
    }
  }
  if (!Number.isFinite(p2p) || p2p <= 0) {
    throw new Error('TasaVE: tasa paralela no válida.');
  }

  return { bcv, p2p };
}
