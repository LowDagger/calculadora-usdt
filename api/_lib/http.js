import crypto from 'node:crypto';

export function send(res, status, body) { res.status(status).json(body); }
export function cors(req, res, methods) {
  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = req.headers.origin;
  if (origin && (!allowed || origin !== allowed)) { send(res, 403, { error: 'Origen no permitido' }); return false; }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Expose-Headers', 'X-Device-Id, X-Device-Secret');
  res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id, X-Device-Secret, Authorization'); res.setHeader('Access-Control-Allow-Methods', methods);
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  return true;
}
export function body(req, max = 16384) {
  const size = Number(req.headers['content-length'] || 0);
  if (size > max || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw Object.assign(new Error('Cuerpo inválido'), { status: 400 });
  return req.body;
}
export function safeEqual(a, b) { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
export function secretHash(secret) { return crypto.createHash('sha256').update(secret).digest('hex'); }
export async function db(path, options = {}) {
  const base = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Configuración del servidor incompleta');
  const response = await fetch(`${base}/rest/v1/${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: options.prefer || 'return=representation', ...options.headers } });
  if (!response.ok) { console.error('Database request failed', response.status); throw Object.assign(new Error('Error de almacenamiento'), { status: response.status === 409 ? 409 : 500 }); }
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
export async function authorize(req) {
  const id = req.headers['x-device-id']; const secret = req.headers['x-device-secret'];
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || typeof secret !== 'string' || secret.length < 32) throw Object.assign(new Error('Credencial inválida'), { status: 401 });
  const rows = await db(`devices?id=eq.${encodeURIComponent(id)}&select=id,secret_hash`);
  if (!rows?.[0] || !safeEqual(rows[0].secret_hash, secretHash(secret))) throw Object.assign(new Error('Credencial inválida'), { status: 401 });
  return id;
}
export function fail(res, error) { send(res, error.status || 500, { error: error.status ? error.message : 'Error interno' }); }
