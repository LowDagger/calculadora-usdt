import { resolveBcvRate } from '../js/bcv-rates.js';

export const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
export const DOLARAPI_RATES_URL = 'https://ve.dolarapi.com/v1/dolares';
export const BINANCE_TRADE_TYPE = 'SELL';
export const BINANCE_ROWS = 20;
export const MINIMUM_VALID_ADS = 5;
export const MAXIMUM_PRICE_SPREAD_RATIO = 3;

const REQUEST_TIMEOUT_MS = 7000;

export class RateProviderError extends Error {
  constructor(code, message, { status = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RateProviderError';
    this.code = code;
    this.status = status;
  }
}

function positiveNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function validTimestamp(value) {
  return typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

async function fetchJson(url, {
  fetchImpl,
  timeoutMs = REQUEST_TIMEOUT_MS,
  init = {},
  provider
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new RateProviderError('UPSTREAM_HTTP_ERROR', `${provider}: respuesta HTTP ${response.status}.`, {
        status: response.status
      });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw new RateProviderError('UPSTREAM_CONTENT_TYPE', `${provider}: tipo de contenido no válido.`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new RateProviderError('UPSTREAM_INVALID_JSON', `${provider}: JSON no válido.`, { cause: error });
    }
  } catch (error) {
    if (error instanceof RateProviderError) throw error;
    if (error?.name === 'AbortError') {
      throw new RateProviderError('UPSTREAM_TIMEOUT', `${provider}: tiempo de espera agotado.`, { cause: error });
    }
    throw new RateProviderError('UPSTREAM_NETWORK_ERROR', `${provider}: no se pudo conectar.`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function median(sortedValues) {
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
    : sortedValues[middle];
}

export function aggregateBinanceAdvertisements(payload, {
  minimumValidAds = MINIMUM_VALID_ADS
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RateProviderError('BINANCE_SHAPE', 'Binance P2P: respuesta no válida.');
  }
  if (payload.code !== '000000' || payload.success !== true) {
    throw new RateProviderError('BINANCE_ERROR_RESPONSE', 'Binance P2P: respuesta de error.');
  }
  if (!Array.isArray(payload.data) || payload.data.length > 100) {
    throw new RateProviderError('BINANCE_SHAPE', 'Binance P2P: lista de anuncios no válida.');
  }

  const prices = payload.data
    .map(item => positiveNumber(item?.adv?.price))
    .filter(price => price !== null)
    .sort((left, right) => left - right);

  if (prices.length < minimumValidAds) {
    throw new RateProviderError('BINANCE_TOO_FEW_ADS', 'Binance P2P: anuncios válidos insuficientes.');
  }
  if (prices.at(-1) / prices[0] > MAXIMUM_PRICE_SPREAD_RATIO) {
    throw new RateProviderError('BINANCE_EXTREME_SPREAD', 'Binance P2P: dispersión extrema no válida.');
  }

  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  if (!Number.isFinite(average)) {
    throw new RateProviderError('BINANCE_EXTREME_VALUES', 'Binance P2P: precios extremos no válidos.');
  }

  return {
    rate: median(prices),
    average,
    minimum: prices[0],
    maximum: prices.at(-1),
    sampleSize: prices.length,
    aggregation: 'median'
  };
}

export async function fetchBinanceP2p({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  const payload = await fetchJson(BINANCE_P2P_URL, {
    fetchImpl,
    timeoutMs,
    provider: 'Binance P2P',
    init: {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: 'VES',
        tradeType: BINANCE_TRADE_TYPE,
        rows: BINANCE_ROWS,
        page: 1,
        payTypes: [],
        publisherType: null,
        transAmount: null
      })
    }
  });
  const statistics = aggregateBinanceAdvertisements(payload);
  const fetchedAt = now().toISOString();
  return {
    rate: statistics.rate,
    tradeType: BINANCE_TRADE_TYPE,
    aggregation: statistics.aggregation,
    sampleSize: statistics.sampleSize,
    minimum: statistics.minimum,
    maximum: statistics.maximum,
    average: statistics.average,
    fetchedAt,
    source: 'binance-p2p',
    status: 'current'
  };
}

function findUsdRate(data, source) {
  return data.find(entry =>
    entry &&
    String(entry.moneda || '').trim().toLowerCase() === 'usd' &&
    String(entry.fuente || '').trim().toLowerCase() === source
  );
}

function normalizeDolarRate(entry, label) {
  const rate = positiveNumber(entry?.promedio);
  const publishedAt = validTimestamp(entry?.fechaActualizacion);
  if (rate === null || !publishedAt) {
    throw new RateProviderError('DOLARAPI_SHAPE', `DolarAPI: tasa ${label} no válida.`);
  }
  return { rate, publishedAt };
}

export async function fetchDolarApiRates({
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  const data = await fetchJson(DOLARAPI_RATES_URL, {
    fetchImpl,
    timeoutMs,
    provider: 'DolarAPI',
    init: { cache: 'no-store' }
  });
  if (!Array.isArray(data)) {
    throw new RateProviderError('DOLARAPI_SHAPE', 'DolarAPI: respuesta no válida.');
  }
  const official = findUsdRate(data, 'oficial');
  const parallel = findUsdRate(data, 'paralelo');
  return {
    official: official ? normalizeDolarRate(official, 'oficial') : null,
    parallel: parallel ? normalizeDolarRate(parallel, 'paralela') : null
  };
}

function publicError(error) {
  return {
    code: error?.code || 'PROVIDER_UNAVAILABLE',
    message: error?.message || 'Proveedor no disponible.'
  };
}

function settled(promise) {
  return promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
}

export async function resolveServerRates({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const nowDate = now();
  if (!(nowDate instanceof Date) || !Number.isFinite(nowDate.getTime())) {
    throw new TypeError('now must return a valid Date');
  }

  const dolarResultPromise = settled(fetchDolarApiRates({ fetchImpl, timeoutMs }));

  const bcvPromise = (async () => {
    try {
      return await resolveBcvRate({ fetchImpl, now: () => nowDate, timeoutMs });
    } catch (primaryError) {
      const dolarResult = await dolarResultPromise;
      const fallback = dolarResult.ok ? dolarResult.value.official : null;
      if (!fallback) throw primaryError;
      return {
        rate: fallback.rate,
        effectiveDate: fallback.publishedAt.slice(0, 10),
        publishedAt: fallback.publishedAt,
        fetchedAt: nowDate.toISOString(),
        source: 'dolarapi-oficial',
        status: 'fallback'
      };
    }
  })();

  const p2pPromise = (async () => {
    try {
      return await fetchBinanceP2p({ fetchImpl, now: () => nowDate, timeoutMs });
    } catch (primaryError) {
      const dolarResult = await dolarResultPromise;
      const fallback = dolarResult.ok ? dolarResult.value.parallel : null;
      if (!fallback) throw primaryError;
      return {
        rate: fallback.rate,
        tradeType: null,
        aggregation: 'provider-value',
        sampleSize: null,
        fetchedAt: nowDate.toISOString(),
        publishedAt: fallback.publishedAt,
        source: 'dolarapi-paralelo',
        status: 'fallback'
      };
    }
  })();

  const [bcvResult, p2pResult] = await Promise.all([settled(bcvPromise), settled(p2pPromise)]);
  const bcv = bcvResult.ok
    ? { ok: true, ...bcvResult.value }
    : { ok: false, error: publicError(bcvResult.error) };
  const p2p = p2pResult.ok
    ? { ok: true, ...p2pResult.value }
    : { ok: false, error: publicError(p2pResult.error) };

  return {
    bcv,
    p2p,
    cacheable: bcv.ok && p2p.ok && bcv.source === 'bcv.today' && p2p.source === 'binance-p2p'
  };
}
