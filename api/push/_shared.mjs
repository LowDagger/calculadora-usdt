const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export const MAX_PUSH_REQUEST_BYTES = 8 * 1024;

export class PushRequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PushRequestError';
    this.status = status;
  }
}

export class PushConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PushConfigurationError';
  }
}

function hasOnlyKeys(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === allowedKeys.length && keys.every(key => allowedKeys.includes(key));
}

function validateEndpoint(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048) {
    throw new PushRequestError('Suscripción no válida.');
  }

  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new PushRequestError('Suscripción no válida.');
  }

  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw new PushRequestError('Suscripción no válida.');
  }
  return endpoint.href;
}

function validateKey(value, { minimum, maximum }) {
  if (
    typeof value !== 'string'
    || value.length < minimum
    || value.length > maximum
    || !BASE64URL.test(value)
  ) {
    throw new PushRequestError('Suscripción no válida.');
  }
  return value;
}

export function validatePushSubscription(value) {
  if (!hasOnlyKeys(value, ['endpoint', 'keys']) || !hasOnlyKeys(value.keys, ['p256dh', 'auth'])) {
    throw new PushRequestError('Suscripción no válida.');
  }

  return {
    endpoint: validateEndpoint(value.endpoint),
    p256dh: validateKey(value.keys.p256dh, { minimum: 80, maximum: 120 }),
    auth: validateKey(value.keys.auth, { minimum: 16, maximum: 64 })
  };
}

export function validatePushUnsubscribe(value) {
  if (!hasOnlyKeys(value, ['endpoint'])) {
    throw new PushRequestError('Suscripción no válida.');
  }
  return { endpoint: validateEndpoint(value.endpoint) };
}

export async function readJsonBody(request) {
  if (!JSON_CONTENT_TYPE.test(request.headers.get('content-type') || '')) {
    throw new PushRequestError('Se requiere application/json.', 415);
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUSH_REQUEST_BYTES) {
    throw new PushRequestError('Solicitud demasiado grande.', 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PUSH_REQUEST_BYTES) {
    throw new PushRequestError('Solicitud demasiado grande.', 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new PushRequestError('JSON no válido.');
  }
}

export function validateVapidPublicKey(value) {
  if (typeof value !== 'string' || value.length !== 87 || !BASE64URL.test(value)) {
    throw new PushConfigurationError('VAPID_PUBLIC_KEY no está configurada correctamente.');
  }

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 65 || decoded[0] !== 4) {
    throw new PushConfigurationError('VAPID_PUBLIC_KEY no está configurada correctamente.');
  }
  return value;
}

export function readPushEnvironment(environment = process.env) {
  const rawUrl = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof rawUrl !== 'string' || typeof serviceRoleKey !== 'string' || !serviceRoleKey.trim()) {
    throw new PushConfigurationError('La persistencia de notificaciones no está configurada.');
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PushConfigurationError('La persistencia de notificaciones no está configurada.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new PushConfigurationError('La persistencia de notificaciones no está configurada.');
  }

  return {
    supabaseUrl: url.href.replace(/\/$/, ''),
    serviceRoleKey: serviceRoleKey.trim()
  };
}

export function createSupabasePushStore({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date()
} = {}) {
  const { supabaseUrl, serviceRoleKey } = readPushEnvironment(environment);
  if (typeof fetchImpl !== 'function') throw new PushConfigurationError('Fetch no está disponible.');

  const request = async (path, init) => {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
        ...init.headers
      }
    });
    if (!response.ok) throw new Error('No se pudo persistir la suscripción.');
  };

  return {
    async upsert(subscription) {
      const timestamp = now().toISOString();
      await request('push_subscriptions?on_conflict=endpoint', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          enabled: true,
          updated_at: timestamp
        })
      });
    },

    async remove(endpoint) {
      await request(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE'
      });
    }
  };
}

export function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      ...headers
    }
  });
}

export function emptyResponse(status = 204) {
  return new Response(null, {
    status,
    headers: { 'cache-control': 'private, no-store' }
  });
}

export function methodNotAllowed(allowedMethod) {
  return json({ error: 'Método no permitido.' }, {
    status: 405,
    headers: { allow: allowedMethod }
  });
}

export function errorResponse(error) {
  if (error instanceof PushRequestError) {
    return json({ error: error.message }, { status: error.status });
  }
  if (error instanceof PushConfigurationError) {
    return json({ error: 'Servicio de notificaciones no configurado.' }, { status: 503 });
  }
  return json({ error: 'No se pudo completar la solicitud.' }, { status: 502 });
}
