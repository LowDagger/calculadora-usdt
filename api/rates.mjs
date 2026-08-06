import { resolveServerRates } from './rate-providers.mjs';

const SUCCESS_CACHE = 'public, s-maxage=45, stale-while-revalidate=75';
const NO_STORE = 'private, no-store';

function json(body, { status = 200, cacheable = false } = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': NO_STORE
  });
  if (cacheable) headers.set('vercel-cdn-cache-control', SUCCESS_CACHE);
  return new Response(JSON.stringify(body), { status, headers });
}

export function createRatesHandler({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== 'GET') {
        return json({ error: 'Método no permitido.' }, { status: 405 });
      }
      try {
        const result = await resolveServerRates({ fetchImpl, now, timeoutMs });
        return json({ bcv: result.bcv, p2p: result.p2p }, { cacheable: result.cacheable });
      } catch {
        return json({ error: 'No se pudieron consultar los proveedores.' }, { status: 502 });
      }
    }
  };
}

export default createRatesHandler();
