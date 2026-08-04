import { authorize, body, cors, db, fail, secretHash, send } from '../_lib/http.js';
export default async function handler(req, res) { if (!cors(req, res, 'POST, OPTIONS')) return; if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  try { const value = body(req); let deviceId = req.headers['x-device-id']; const deviceSecret = req.headers['x-device-secret'];
    if (!/^[0-9a-f-]{36}$/i.test(deviceId || '') || typeof deviceSecret !== 'string' || deviceSecret.length < 43) return send(res, 401, { error: 'Credencial inválida' });
    const devices = await db(`devices?id=eq.${encodeURIComponent(deviceId)}&select=id`); if (devices.length) await authorize(req); else await db('devices', { method: 'POST', body: JSON.stringify({ id: deviceId, secret_hash: secretHash(deviceSecret) }) });
    const sub = value.subscription; if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 2048 || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return send(res, 400, { error: 'Suscripción inválida' });
    const existing = await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}&select=id,device_id`); if (existing[0] && existing[0].device_id !== deviceId) return send(res, 409, { error: 'La suscripción pertenece a otro dispositivo' });
    await db('push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ device_id: deviceId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, updated_at: new Date().toISOString() }) }); send(res, 201, { deviceId });
  } catch (error) { fail(res, error); } }
