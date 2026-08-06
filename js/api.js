import { markBcvRecordCached, selectNewestBcvRecord } from './bcv-rates.js';

export const RATES_ENDPOINT = '/api/rates';

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
