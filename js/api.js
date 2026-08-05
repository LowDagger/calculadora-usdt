import { resolveBcvRate } from './bcv-rates.js';

/** DolarAPI Venezuela combined rates endpoint (no authentication required). */
export const DOLARAPI_RATES = 'https://ve.dolarapi.com/v1/dolares';

const REQUEST_TIMEOUT_MS = 9000;

function providerError(message) {
  return new Error(`Proveedor de tasas: ${message}`);
}

function findUsdRate(data, source) {
  return data.find(entry =>
    entry &&
    String(entry.moneda || '').trim().toLowerCase() === 'usd' &&
    String(entry.fuente || '').trim().toLowerCase() === source
  );
}

function positiveRate(entry, label) {
  const rate = Number(entry?.promedio);
  if (!Number.isFinite(rate) || rate <= 0) throw providerError(`tasa ${label} no válida.`);
  return rate;
}

function validDate(entry, label) {
  const value = entry?.fechaActualizacion;
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw providerError(`fecha de actualización ${label} no válida.`);
  }
  return value;
}

async function fetchDolarRates(fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(DOLARAPI_RATES, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw providerError(`respuesta HTTP ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data)) throw providerError('la respuesta no es una lista válida.');

    const parallel = findUsdRate(data, 'paralelo');
    if (!parallel) throw providerError('no se encontró la tasa paralela USD.');
    const official = findUsdRate(data, 'oficial');
    return {
      p2p: positiveRate(parallel, 'paralela'),
      p2pUpdatedAt: validDate(parallel, 'paralela'),
      official
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createDolarBcvFallback(official, nowDate) {
  if (!official) return null;
  try {
    const publishedAt = validDate(official, 'oficial');
    return {
      rate: positiveRate(official, 'oficial'),
      effectiveDate: publishedAt.slice(0, 10),
      publishedAt,
      source: 'dolarapi.com.ve',
      status: 'cached',
      fetchedAt: nowDate.toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Fetch P2P from DolarAPI and resolve BCV independently from BCV Today.
 * Both values are returned atomically so the UI never applies a partial refresh.
 */
export async function fetchRates({
  cachedBcv = null,
  fetchImpl = globalThis.fetch,
  now = () => new Date()
} = {}) {
  const nowDate = typeof now === 'function' ? now() : now;
  const dolarRates = await fetchDolarRates(fetchImpl);
  const bcvRecord = await resolveBcvRate({
    cachedRecord: cachedBcv,
    secondaryRecord: createDolarBcvFallback(dolarRates.official, nowDate),
    fetchImpl,
    now: () => nowDate
  });
  return {
    bcv: bcvRecord.rate,
    p2p: dolarRates.p2p,
    bcvEffectiveDate: bcvRecord.effectiveDate,
    bcvPublishedAt: bcvRecord.publishedAt,
    bcvSource: bcvRecord.source,
    bcvStatus: bcvRecord.status,
    bcvRecord,
    p2pUpdatedAt: dolarRates.p2pUpdatedAt
  };
}
