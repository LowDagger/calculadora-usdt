import { authorize, body, cors, db, fail, send } from '../_lib/http.js';
export default async function handler(req, res) { if (!cors(req, res, 'PATCH, DELETE, OPTIONS')) return; try { const device = await authorize(req); const id = req.query.id; if (!/^[0-9a-f-]{36}$/i.test(id || '')) return send(res, 400, { error: 'Identificador inválido' });
  if (req.method === 'DELETE') { await db(`rate_alerts?id=eq.${id}&device_id=eq.${device}`, { method: 'DELETE', prefer: 'return=minimal' }); return send(res, 200, { ok: true }); }
  if (req.method !== 'PATCH') return send(res, 405, { error: 'Método no permitido' }); const v = body(req); if (typeof v.active !== 'boolean') return send(res, 400, { error: 'Estado inválido' });
  if (v.active) { const active = await db(`rate_alerts?device_id=eq.${device}&active=eq.true&select=id`); if (active.length >= 5) return send(res, 409, { error: 'Máximo cinco alertas activas' }); }
  const rows = await db(`rate_alerts?id=eq.${id}&device_id=eq.${device}`, { method: 'PATCH', body: JSON.stringify({ active: v.active, updated_at: new Date().toISOString() }) }); if (!rows.length) return send(res, 404, { error: 'Alerta no encontrada' }); send(res, 200, rows[0]);
} catch (error) { fail(res, error); } }
