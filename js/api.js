import { markBcvRecordCached, selectNewestBcvRecord } from './bcv-rates.js';
import { DEFAULT_PROFILE_IDS, sanitizeCardFee } from './bank-profiles.js';

export const RATES_ENDPOINT = '/api/rates';
export const CONFIG_ENDPOINT = '/api/config';

const REQUEST_TIMEOUT_MS = 10_000;
const P2P_STALE_MS = 10 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

function providerError(message) {
  return new Error(`Proveedor de tasas: ${message}`);
}

function positiveRate(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function validTimestamp(value, nowDate) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > nowDate.getTime() + FUTURE_CLOCK_SKEW_MS) return null;
  return value;
}

function normalizeP2pRecord(record, nowDate) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const rate = positiveRate(record.rate);
  const fetchedAt = validTimestamp(record.fetchedAt, nowDate);
  const source = typeof record.source === 'string' && record.source.trim() ? record.source.trim() : null;
  if (rate === null || !fetchedAt || !source) return null;

  if (source === 'binance-p2p') {
    if (record.tradeType !== 'SELL' || record.aggregation !== 'median' ||
        !Number.isInteger(record.sampleSize) || record.sampleSize < 5) return null;
  } else if (source === 'dolarapi-paralelo') {
    if (record.status !== 'fallback' || record.aggregation !== 'provider-value' ||
        !validTimestamp(record.publishedAt, nowDate)) return null;
  } else {
    return null;
  }

  return {
    rate,
    tradeType: record.tradeType ?? null,
    aggregation: record.aggregation,
    sampleSize: record.sampleSize ?? null,
    fetchedAt,
    publishedAt: record.publishedAt ?? null,
    source,
    status: record.status
  };
}

export function markP2pRecordCached(record, { now = new Date() } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) return null;
  const normalized = normalizeP2pRecord(record, nowDate);
  if (!normalized) return null;
  const age = nowDate.getTime() - Date.parse(normalized.fetchedAt);
  return { ...normalized, status: age > P2P_STALE_MS ? 'stale' : 'cached' };
}

function selectNewestP2pRecord(networkRecord, cachedRecord, nowDate) {
  const network = normalizeP2pRecord(networkRecord, nowDate);
  const cached = normalizeP2pRecord(cachedRecord, nowDate);
  if (!network) return cached ? { record: markP2pRecordCached(cached, { now: nowDate }), updated: false } : null;
  if (!cached) return { record: network, updated: true };
  if (Date.parse(network.fetchedAt) < Date.parse(cached.fetchedAt)) {
    return { record: markP2pRecordCached(cached, { now: nowDate }), updated: false };
  }
  return { record: network, updated: true };
}

function failedResult(result) {
  return {
    ok: false,
    error: result?.error && typeof result.error === 'object'
      ? result.error
      : { code: 'INVALID_PROVIDER_RESPONSE', message: 'Respuesta no válida.' }
  };
}

function normalizeBcvResult(result, cachedBcv, nowDate) {
  if (result?.ok !== true) return failedResult(result);
  const selected = selectNewestBcvRecord(result, cachedBcv, { now: nowDate });
  return selected
    ? { ok: true, ...selected }
    : failedResult({ error: { code: 'INVALID_BCV_RESPONSE', message: 'BCV no válido.' } });
}

function normalizeP2pResult(result, cachedP2p, nowDate) {
  if (result?.ok !== true) return failedResult(result);
  const selected = selectNewestP2pRecord(result, cachedP2p, nowDate);
  return selected
    ? { ok: true, ...selected }
    : failedResult({ error: { code: 'INVALID_P2P_RESPONSE', message: 'P2P no válido.' } });
}

export async function fetchRates({
  cachedBcv = null,
  cachedP2p = null,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const nowDate = typeof now === 'function' ? now() : now;
  if (!(nowDate instanceof Date) || !Number.isFinite(nowDate.getTime())) {
    throw new TypeError('now must resolve to a valid date');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(RATES_ENDPOINT, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw providerError(`respuesta HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw providerError('tipo de contenido no válido.');
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw providerError('respuesta no válida.');
    }
    return {
      bcv: normalizeBcvResult(data.bcv, cachedBcv, nowDate),
      p2p: normalizeP2pResult(data.p2p, cachedP2p, nowDate)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function preserveFailedRates({ bcvRecord, p2pRecord, now = new Date() }) {
  return {
    bcvRecord: markBcvRecordCached(bcvRecord, { now }),
    p2pRecord: markP2pRecordCached(p2pRecord, { now })
  };
}

export function validateOperationalConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.configVersion !== 1) return null;

  const validated = {
    configVersion: 1
  };

  if (typeof data.updatedAt === 'string' && data.updatedAt.trim()) {
    validated.updatedAt = data.updatedAt.trim();
  }

  if (data.defaults && typeof data.defaults === 'object' && !Array.isArray(data.defaults)) {
    const rawBpay = data.defaults.bpayFee;
    if (typeof rawBpay === 'number' && Number.isFinite(rawBpay) && rawBpay >= 0 && rawBpay < 100) {
      validated.defaults = {
        bpayFee: Math.round((rawBpay + Number.EPSILON) * 100) / 100
      };
    }
  }

  if (data.bankFees && typeof data.bankFees === 'object' && !Array.isArray(data.bankFees)) {
    const bankFees = {};
    for (const [id, rawFee] of Object.entries(data.bankFees)) {
      if (DEFAULT_PROFILE_IDS.has(id)) {
        const sanitized = sanitizeCardFee(rawFee);
        if (sanitized !== null) {
          bankFees[id] = sanitized;
        }
      }
    }
    if (Object.keys(bankFees).length > 0) {
      validated.bankFees = bankFees;
    }
  }

  if (data.telegramCommunityPromo !== undefined) {
    if (data.telegramCommunityPromo && typeof data.telegramCommunityPromo === 'object' && !Array.isArray(data.telegramCommunityPromo)) {
      const promo = data.telegramCommunityPromo;
      const enabled = typeof promo.enabled === 'boolean' ? promo.enabled : false;
      const campaignId = typeof promo.campaignId === 'string' ? promo.campaignId.trim() : '';
      const rawEndsAt = typeof promo.endsAt === 'string' ? promo.endsAt.trim() : (typeof promo.campaignEndsAt === 'string' ? promo.campaignEndsAt.trim() : '');
      const endsAtMs = rawEndsAt ? Date.parse(rawEndsAt) : NaN;
      if (campaignId && Number.isFinite(endsAtMs)) {
        validated.telegramCommunityPromo = {
          enabled,
          campaignId,
          endsAt: new Date(endsAtMs).toISOString()
        };
      }
    }
  }

  return validated;
}

export async function fetchRemoteConfig({
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(CONFIG_ENDPOINT, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;
    const data = await response.json();
    return validateOperationalConfig(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

