export const DEFAULT_TELEGRAM_COMMUNITY_PROMO = Object.freeze({
  enabled: true,
  campaignId: 'telegram-community-2026-09',
  endsAt: '2026-10-17T00:00:00.000Z'
});

export const DEFAULT_OPERATIONAL_CONFIG = Object.freeze({
  configVersion: 1,
  defaults: Object.freeze({
    bpayFee: 4.1
  }),
  bankFees: Object.freeze({
    'bdv-fisica': 2.5,
    'bdv-virtual': 2.5,
    'bbva-provincial': 1.5,
    'banco-tesoro': 2.5,
    bancamiga: 5,
    'banesco-fisica': 1.5,
    'banesco-virtual': 2.5,
    bnc: 1.5,
    bdt: 2.5
  }),
  telegramCommunityPromo: DEFAULT_TELEGRAM_COMMUNITY_PROMO
});

export const KNOWN_BANK_IDS = Object.freeze(new Set([
  'bdv-fisica',
  'bdv-virtual',
  'bbva-provincial',
  'banco-tesoro',
  'bancamiga',
  'banesco-fisica',
  'banesco-virtual',
  'bnc',
  'bdt'
]));

const SUCCESS_CACHE = 'public, s-maxage=60, stale-while-revalidate=120';
const NO_STORE = 'private, no-store';
const REQUEST_TIMEOUT_MS = 5000;

function json(body, { status = 200, cacheable = false } = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': NO_STORE
  });
  if (cacheable) headers.set('vercel-cdn-cache-control', SUCCESS_CACHE);
  return new Response(JSON.stringify(body), { status, headers });
}

export function validateRemoteConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) return null;
  if (rawConfig.configVersion !== 1) return null;

  const validated = {
    configVersion: 1
  };

  if (typeof rawConfig.updatedAt === 'string' && rawConfig.updatedAt.trim()) {
    validated.updatedAt = rawConfig.updatedAt.trim();
  }

  if (rawConfig.defaults && typeof rawConfig.defaults === 'object' && !Array.isArray(rawConfig.defaults)) {
    const rawBpay = rawConfig.defaults.bpayFee;
    if (typeof rawBpay === 'number' && Number.isFinite(rawBpay) && rawBpay >= 0 && rawBpay < 100) {
      validated.defaults = {
        bpayFee: Math.round((rawBpay + Number.EPSILON) * 100) / 100
      };
    }
  }

  if (rawConfig.bankFees && typeof rawConfig.bankFees === 'object' && !Array.isArray(rawConfig.bankFees)) {
    const bankFees = {};
    for (const [id, rawFee] of Object.entries(rawConfig.bankFees)) {
      if (KNOWN_BANK_IDS.has(id) && typeof rawFee === 'number' && Number.isFinite(rawFee) && rawFee >= 0 && rawFee <= 100) {
        bankFees[id] = Math.round((rawFee + Number.EPSILON) * 100) / 100;
      }
    }
    if (Object.keys(bankFees).length > 0) {
      validated.bankFees = bankFees;
    }
  }

  if (rawConfig.telegramCommunityPromo !== undefined) {
    if (rawConfig.telegramCommunityPromo && typeof rawConfig.telegramCommunityPromo === 'object' && !Array.isArray(rawConfig.telegramCommunityPromo)) {
      const promo = rawConfig.telegramCommunityPromo;
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

function extractConfigFromEdgeResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.config && typeof data.config === 'object' && !Array.isArray(data.config)) {
    return data.config;
  }
  if (data.calcuflow && typeof data.calcuflow === 'object' && !Array.isArray(data.calcuflow)) {
    return data.calcuflow;
  }
  if (data.configVersion !== undefined || data.defaults !== undefined || data.bankFees !== undefined) {
    return data;
  }
  return null;
}

export async function resolveServerConfig({
  edgeConfigUrl = process.env.EDGE_CONFIG,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  if (!edgeConfigUrl || typeof edgeConfigUrl !== 'string' || !edgeConfigUrl.trim()) {
    return { config: DEFAULT_OPERATIONAL_CONFIG, cacheable: false, source: 'default' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(edgeConfigUrl);
  } catch {
    return { config: DEFAULT_OPERATIONAL_CONFIG, cacheable: false, source: 'default' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const itemsUrl = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/+$/, '')}/items${parsedUrl.search}`;
    const response = await fetchImpl(itemsUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return { config: DEFAULT_OPERATIONAL_CONFIG, cacheable: false, source: 'default' };
    }

    const data = await response.json();
    const extracted = extractConfigFromEdgeResponse(data);
    const validated = validateRemoteConfig(extracted);

    if (!validated) {
      return { config: DEFAULT_OPERATIONAL_CONFIG, cacheable: false, source: 'default' };
    }

    const mergedConfig = {
      configVersion: 1,
      ...(validated.updatedAt ? { updatedAt: validated.updatedAt } : {}),
      defaults: {
        bpayFee: validated.defaults?.bpayFee ?? DEFAULT_OPERATIONAL_CONFIG.defaults.bpayFee
      },
      bankFees: {
        ...DEFAULT_OPERATIONAL_CONFIG.bankFees,
        ...(validated.bankFees || {})
      },
      telegramCommunityPromo: validated.telegramCommunityPromo ?? DEFAULT_OPERATIONAL_CONFIG.telegramCommunityPromo
    };

    return { config: mergedConfig, cacheable: true, source: 'edge-config' };
  } catch {
    return { config: DEFAULT_OPERATIONAL_CONFIG, cacheable: false, source: 'default' };
  } finally {
    clearTimeout(timeout);
  }
}

export function createConfigHandler({
  fetchImpl = globalThis.fetch,
  getEdgeConfigUrl = () => process.env.EDGE_CONFIG,
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== 'GET') {
        return json({ error: 'Método no permitido.' }, { status: 405 });
      }
      const edgeConfigUrl = getEdgeConfigUrl();
      const result = await resolveServerConfig({ edgeConfigUrl, fetchImpl, timeoutMs });
      return json(result.config, { cacheable: result.cacheable });
    }
  };
}

export default createConfigHandler();
