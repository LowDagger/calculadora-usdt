import { USER_DIRECTIONS } from '../services/rateStatistics.mjs';

export const BINANCE_P2P_ENDPOINT =
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
export const MAX_ROWS = 20;

const CODE_PATTERN = /^[A-Z0-9]{2,12}$/;
const PAYMENT_PATTERN = /^[\p{L}\p{N} ._()+&/-]{1,64}$/u;
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DIRECTIONS = Object.freeze({
  [USER_DIRECTIONS.USER_BUYS_USDT]: {
    userDirection: USER_DIRECTIONS.USER_BUYS_USDT,
    binanceTradeType: 'BUY',
    advertiserDirection: 'advertiserSellsUsdt'
  },
  [USER_DIRECTIONS.USER_SELLS_USDT]: {
    userDirection: USER_DIRECTIONS.USER_SELLS_USDT,
    binanceTradeType: 'SELL',
    advertiserDirection: 'advertiserBuysUsdt'
  }
});

export class P2PProviderError extends Error {
  constructor({ code, message, retryable = false, status = null, retryAfterMs = null, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = 'P2PProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      status: this.status,
      retryAfterMs: this.retryAfterMs
    };
  }
}

function validationError(message) {
  return new P2PProviderError({
    code: 'INVALID_REQUEST',
    message,
    retryable: false
  });
}

function normalizeCode(value, name) {
  if (typeof value !== 'string') throw validationError(`${name} must be a string`);
  const normalized = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(normalized)) {
    throw validationError(`${name} must contain 2-12 letters or digits`);
  }
  return normalized;
}

function integerInRange(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw validationError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function optionalPositiveNumber(value, name) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' &&
      (typeof value !== 'string' || !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim()))) {
    throw validationError(`${name} must be a positive decimal number`);
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw validationError(`${name} must be a positive finite number`);
  }
  return numeric;
}

function optionalNonNegativeInteger(value, name) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw validationError(`${name} must be a non-negative integer`);
  }
  return value;
}

function normalizePayTypes(value) {
  if (!Array.isArray(value) || value.length > 20) {
    throw validationError('payTypes must be an array with at most 20 entries');
  }
  const normalized = value.map(item => {
    if (typeof item !== 'string' || !PAYMENT_PATTERN.test(item.trim())) {
      throw validationError('each payment method must be a non-empty safe string');
    }
    return item.trim();
  });
  return [...new Set(normalized)];
}

function normalizePublisherType(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
    throw validationError('publisherType is malformed');
  }
  return value;
}

function normalizeCompletionRate(value) {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw validationError('minimumCompletionRate must be between 0 and 1');
  }
  return numeric;
}

function resolveDirection(tradeType, userDirection) {
  if (userDirection !== null && userDirection !== undefined) {
    if (!DIRECTIONS[userDirection]) throw validationError('unsupported userDirection');
    if (tradeType !== null && tradeType !== undefined) {
      if (typeof tradeType !== 'string' || tradeType.trim().toUpperCase() !== DIRECTIONS[userDirection].binanceTradeType) {
        throw validationError('tradeType conflicts with userDirection');
      }
    }
    return DIRECTIONS[userDirection];
  }
  if (typeof tradeType !== 'string') throw validationError('tradeType or userDirection is required');
  const normalized = tradeType.trim().toUpperCase();
  const direction = Object.values(DIRECTIONS).find(item => item.binanceTradeType === normalized);
  if (!direction) throw validationError('tradeType must be BUY or SELL');
  return direction;
}

export function validateP2PRequest(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw validationError('request options must be an object');
  }
  const direction = resolveDirection(options.tradeType, options.userDirection);
  return {
    asset: normalizeCode(options.asset ?? 'USDT', 'asset'),
    fiat: normalizeCode(options.fiat, 'fiat'),
    direction,
    rows: integerInRange(options.rows ?? 10, 'rows', 1, MAX_ROWS),
    page: integerInRange(options.page ?? 1, 'page', 1, 1000),
    payTypes: normalizePayTypes(options.payTypes ?? []),
    publisherType: normalizePublisherType(options.publisherType),
    transAmount: optionalPositiveNumber(options.transAmount, 'transAmount'),
    minimumCompletionRate: normalizeCompletionRate(options.minimumCompletionRate),
    minimumCompletedOrders: optionalNonNegativeInteger(options.minimumCompletedOrders, 'minimumCompletedOrders'),
    merchantOnly: options.merchantOnly === true
  };
}

function finitePositive(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function finiteNonNegative(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizePaymentMethods(methods) {
  if (!Array.isArray(methods)) return [];
  return [...new Set(methods
    .flatMap(method => [method?.identifier, method?.tradeMethodName, method?.payType])
    .filter(method => typeof method === 'string' && method.trim())
    .map(method => method.trim()))];
}

function normalizeAdvertisement(item) {
  const adv = item?.adv;
  const advertiser = item?.advertiser;
  if (!adv || typeof adv !== 'object') return null;
  const price = finitePositive(adv.price);
  if (price === null) return null;

  const completionRate = finiteNonNegative(advertiser?.monthFinishRate);
  const completedOrders = finiteNonNegative(advertiser?.monthOrderCount);
  const merchantType = typeof advertiser?.userType === 'string'
    ? advertiser.userType
    : (typeof advertiser?.userGrade === 'string' ? advertiser.userGrade : null);

  return {
    price,
    availableAmount: finiteNonNegative(adv.surplusAmount),
    minTransactionAmount: finiteNonNegative(adv.minSingleTransAmount),
    maxTransactionAmount: finiteNonNegative(adv.maxSingleTransAmount),
    advertiserName: typeof advertiser?.nickName === 'string' ? advertiser.nickName : null,
    merchantType,
    completionRate: completionRate !== null && completionRate <= 1 ? completionRate : null,
    completedOrders: completedOrders !== null ? Math.trunc(completedOrders) : null,
    paymentMethods: normalizePaymentMethods(adv.tradeMethods)
  };
}

function isMerchant(advertisement) {
  return typeof advertisement.merchantType === 'string' &&
    /merchant|professional/i.test(advertisement.merchantType);
}

function applyQualityFilters(advertisements, request) {
  return advertisements.filter(advertisement => {
    if (request.minimumCompletionRate !== null &&
        (advertisement.completionRate === null || advertisement.completionRate < request.minimumCompletionRate)) return false;
    if (request.minimumCompletedOrders !== null &&
        (advertisement.completedOrders === null || advertisement.completedOrders < request.minimumCompletedOrders)) return false;
    if (request.merchantOnly && !isMerchant(advertisement)) return false;
    if (request.transAmount !== null && (
      (advertisement.minTransactionAmount !== null && request.transAmount < advertisement.minTransactionAmount) ||
      (advertisement.maxTransactionAmount !== null && request.transAmount > advertisement.maxTransactionAmount)
    )) return false;
    if (request.payTypes.length && !request.payTypes.some(requested =>
      advertisement.paymentMethods.some(actual => actual.toLowerCase() === requested.toLowerCase())
    )) return false;
    return true;
  });
}

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function httpError(response) {
  const status = response.status;
  if (status === 429) {
    return new P2PProviderError({
      code: 'UPSTREAM_RATE_LIMITED',
      message: 'Binance temporarily rate-limited the request',
      retryable: true,
      status,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after'))
    });
  }
  return new P2PProviderError({
    code: status === 403 ? 'UPSTREAM_FORBIDDEN' : (status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_HTTP_ERROR'),
    message: `Binance returned HTTP ${status}`,
    retryable: TRANSIENT_STATUS_CODES.has(status),
    status
  });
}

async function readJson(response) {
  let text;
  try {
    text = await response.text();
    return JSON.parse(text);
  } catch (cause) {
    throw new P2PProviderError({
      code: 'UPSTREAM_MALFORMED_JSON',
      message: 'Binance returned malformed JSON',
      retryable: false,
      status: response.status,
      cause
    });
  }
}

function assertResponseShape(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.data)) {
    throw new P2PProviderError({
      code: 'UPSTREAM_UNEXPECTED_SCHEMA',
      message: 'Binance response does not contain an advertisement list',
      retryable: false,
      status: 200
    });
  }
  return body.data;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function cacheKey(request) {
  return JSON.stringify(request);
}

export function createBinanceP2PProvider({
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  retries = 2,
  retryBaseDelayMs = 250,
  cacheTtlMs = 15_000,
  random = Math.random,
  sleep = wait,
  now = Date.now
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  integerInRange(timeoutMs, 'timeoutMs', 1, 60_000);
  integerInRange(retries, 'retries', 0, 2);
  integerInRange(retryBaseDelayMs, 'retryBaseDelayMs', 0, 60_000);
  integerInRange(cacheTtlMs, 'cacheTtlMs', 0, 300_000);
  const cache = new Map();

  async function requestOnce(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const payload = {
      asset: request.asset,
      fiat: request.fiat,
      tradeType: request.direction.binanceTradeType,
      rows: request.rows,
      page: request.page,
      payTypes: request.payTypes,
      publisherType: request.publisherType,
      transAmount: request.transAmount === null ? null : String(request.transAmount)
    };

    try {
      const response = await fetchImpl(BINANCE_P2P_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': 'CalcuFlow-Binance-P2P-PoC/1.0 (local development)'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) throw httpError(response);
      const body = await readJson(response);
      const rawAdvertisements = assertResponseShape(body);
      const normalized = rawAdvertisements.map(normalizeAdvertisement).filter(Boolean);
      return {
        provider: 'binanceP2P',
        asset: request.asset,
        fiat: request.fiat,
        tradeDirection: request.direction,
        returnedAdvertisementCount: rawAdvertisements.length,
        advertisements: applyQualityFilters(normalized, request),
        cached: false
      };
    } catch (error) {
      if (error instanceof P2PProviderError) throw error;
      if (error?.name === 'AbortError') {
        throw new P2PProviderError({
          code: 'UPSTREAM_TIMEOUT',
          message: `Binance request timed out after ${timeoutMs} ms`,
          retryable: true,
          cause: error
        });
      }
      throw new P2PProviderError({
        code: 'UPSTREAM_NETWORK_ERROR',
        message: 'Could not reach Binance P2P',
        retryable: true,
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return async function getP2PRates(options) {
    const request = validateP2PRequest(options);
    const key = cacheKey(request);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return { ...cached.value, cached: true };

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const value = await requestOnce(request);
        if (cacheTtlMs > 0) cache.set(key, { value, expiresAt: now() + cacheTtlMs });
        return value;
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempt === retries) break;
        const exponentialDelay = retryBaseDelayMs * (2 ** attempt);
        const jitter = Math.floor(exponentialDelay * 0.25 * random());
        await sleep(Math.max(error.retryAfterMs ?? 0, exponentialDelay + jitter));
      }
    }
    throw lastError;
  };
}

export const getP2PRates = createBinanceP2PProvider();
