export const BCV_HISTORY_URL = 'https://bcv.today/api/v1/history.json';
export const BCV_CURRENT_URL = 'https://bcv.today/api/v1/rate.json';
export const BCV_CACHE_TTL_MS = 5 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 7000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const STALE_CACHE_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/;
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function providerError(message) {
  return new Error(`BCV Today: ${message}`);
}

function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('now must resolve to a valid date');
  return date;
}

function validDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function positiveRate(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function validPublishedAt(value, nowDate) {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > nowDate.getTime() + FUTURE_CLOCK_SKEW_MS) return null;
  return value;
}

export function getCaracasDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(asDate(now));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function statusForEffectiveDate(effectiveDate, nowDate) {
  return effectiveDate > getCaracasDate(nowDate) ? 'announced' : 'current';
}

export function normalizeHistoryRecord(entry, { now = new Date() } = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const nowDate = asDate(now);
  const rate = positiveRate(entry.USD);
  const effectiveDate = validDateOnly(entry.effective_date);
  const recordDate = validDateOnly(entry.date);
  const publishedAt = validPublishedAt(entry.updated_at, nowDate);
  if (rate === null || !effectiveDate || !recordDate || !publishedAt) return null;
  return {
    rate,
    effectiveDate,
    publishedAt,
    source: 'bcv.today',
    status: statusForEffectiveDate(effectiveDate, nowDate)
  };
}

function compareRecords(left, right) {
  const effectiveComparison = left.effectiveDate.localeCompare(right.effectiveDate);
  if (effectiveComparison !== 0) return effectiveComparison;
  return Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
}

export function selectLatestAnnouncedRate(history, { now = new Date() } = {}) {
  if (!Array.isArray(history)) return null;
  const byEffectiveDate = new Map();
  for (const entry of history) {
    const normalized = normalizeHistoryRecord(entry, { now });
    if (!normalized) continue;
    const previous = byEffectiveDate.get(normalized.effectiveDate);
    if (!previous || compareRecords(normalized, previous) > 0) {
      byEffectiveDate.set(normalized.effectiveDate, normalized);
    }
  }
  return [...byEffectiveDate.values()].sort(compareRecords).at(-1) ?? null;
}

function sanitizeStoredRecord(record, nowDate) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const rate = positiveRate(record.rate);
  const effectiveDate = validDateOnly(record.effectiveDate);
  const publishedAt = validPublishedAt(record.publishedAt, nowDate);
  const fetchedAt = typeof record.fetchedAt === 'string' && Number.isFinite(Date.parse(record.fetchedAt))
    ? record.fetchedAt
    : null;
  const source = typeof record.source === 'string' && record.source.trim() ? record.source.trim() : null;
  if (rate === null || !effectiveDate || !publishedAt || !source) return null;
  return { rate, effectiveDate, publishedAt, source, status: record.status, fetchedAt };
}

function cachedStatus(record, nowDate) {
  const fetchedAt = record.fetchedAt ? Date.parse(record.fetchedAt) : NaN;
  return Number.isFinite(fetchedAt) && nowDate.getTime() - fetchedAt > STALE_CACHE_MS ? 'stale' : 'cached';
}

function markCached(record, nowDate) {
  return { ...record, status: cachedStatus(record, nowDate) };
}

export function markBcvRecordCached(record, { now = new Date() } = {}) {
  const nowDate = asDate(now);
  const stored = sanitizeStoredRecord(record, nowDate);
  return stored ? markCached(stored, nowDate) : null;
}

function isFreshCache(record, nowDate) {
  if (!record?.fetchedAt) return false;
  const age = nowDate.getTime() - Date.parse(record.fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < BCV_CACHE_TTL_MS;
}

function newestRecord(left, right) {
  if (!left) return right;
  if (!right) return left;
  return compareRecords(left, right) >= 0 ? left : right;
}

async function fetchJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw providerError(`respuesta HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw providerError('tipo de contenido no válido.');
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function selectNewestBcvRecord(networkRecord, cachedRecord = null, { now = new Date() } = {}) {
  const nowDate = asDate(now);
  const network = sanitizeStoredRecord(networkRecord, nowDate);
  const cached = sanitizeStoredRecord(cachedRecord, nowDate);
  if (!network) return cached ? { record: markCached(cached, nowDate), updated: false } : null;
  if (!cached) return { record: network, updated: true };
  const comparison = compareRecords(network, cached);
  if (comparison < 0 || (comparison === 0 && cached.fetchedAt && network.fetchedAt &&
      Date.parse(cached.fetchedAt) > Date.parse(network.fetchedAt))) {
    return { record: markCached(cached, nowDate), updated: false };
  }
  return { record: network, updated: true };
}

function normalizeCurrentResponse(entry, nowDate) {
  return normalizeHistoryRecord(entry, { now: nowDate });
}

/**
 * Resolve the newest announced BCV rate without allowing an older network
 * fallback to overwrite a newer stored record.
 */
export async function resolveBcvRate({
  cachedRecord = null,
  secondaryRecord = null,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const nowDate = asDate(typeof now === 'function' ? now() : now);
  const cached = sanitizeStoredRecord(cachedRecord, nowDate);
  const secondary = sanitizeStoredRecord(secondaryRecord, nowDate);

  if (isFreshCache(cached, nowDate)) return markCached(cached, nowDate);

  let historyRecord = null;
  let historyError = null;
  try {
    const history = await fetchJson(BCV_HISTORY_URL, { fetchImpl, timeoutMs });
    historyRecord = selectLatestAnnouncedRate(history, { now: nowDate });
  } catch (error) {
    historyError = error;
  }

  if (historyRecord) {
    const selected = newestRecord(cached, historyRecord);
    if (selected === cached) return markCached(cached, nowDate);
    return { ...historyRecord, fetchedAt: nowDate.toISOString() };
  }

  let currentRecord = null;
  let currentError = null;
  try {
    const current = await fetchJson(BCV_CURRENT_URL, { fetchImpl, timeoutMs });
    currentRecord = normalizeCurrentResponse(current, nowDate);
  } catch (error) {
    currentError = error;
  }

  if (currentRecord) {
    const selected = newestRecord(cached, currentRecord);
    if (selected === cached) return markCached(cached, nowDate);
    return { ...currentRecord, fetchedAt: nowDate.toISOString() };
  }
  if (cached) return markCached(cached, nowDate);
  if (secondary) return { ...secondary, status: 'cached', fetchedAt: nowDate.toISOString() };

  throw historyError || currentError || providerError('no se encontró una tasa USD válida.');
}

export function formatBcvRateLabel(record, { now = new Date() } = {}) {
  const nowDate = asDate(now);
  const effectiveDate = validDateOnly(record?.effectiveDate);
  if (!effectiveDate) return '';
  const [, month, day] = effectiveDate.split('-').map(Number);
  const compactDate = `${day} ${MONTH_NAMES[month - 1]}`;
  const today = getCaracasDate(nowDate);
  if (effectiveDate > today) return `Tasa anunciada · Vigente ${compactDate}`;
  if (effectiveDate === today) return record?.status === 'cached' || record?.status === 'stale'
    ? 'BCV vigente hoy · guardada'
    : 'BCV vigente hoy';
  return record?.status === 'cached' || record?.status === 'stale'
    ? `Tasa guardada · Vigente ${compactDate}`
    : `Vigente ${compactDate}`;
}
