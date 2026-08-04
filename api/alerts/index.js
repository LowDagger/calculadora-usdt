import { authorize, body, cors, db, fail, send } from '../_lib/http.js';
const VALID = { rate_type: ['p2p', 'bcv'], measurement: ['ves', 'percent'], direction: ['up', 'down', 'any'] };
export default async function handler(req, res) { if (!cors(req, res, 'GET, POST, OPTIONS')) return; try { const id = await authorize(req);
  if (req.method === 'GET') return send(res, 200, await db(`rate_alerts?device_id=eq.${id}&select=*&order=created_at.desc`));
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' }); const v = body(req); const threshold = Number(v.threshold); const baseline = Number(v.baseline_rate);
  if (!VALID.rate_type.includes(v.rate_type) || !VALID.measurement.includes(v.measurement) || !VALID.direction.includes(v.direction) || !Number.isFinite(threshold) || threshold < (v.measurement === 'ves' ? 1 : .1) || threshold > (v.measurement === 'ves' ? 100000 : 1000) || !Number.isFinite(baseline) || baseline <= 0 || baseline > 10000000) return send(res, 400, { error: 'Datos de alerta inválidos' });
  const active = await db(`rate_alerts?device_id=eq.${id}&active=eq.true&select=id`); if (active.length >= 5) return send(res, 409, { error: 'Máximo cinco alertas activas' });
  const rows = await db('rate_alerts', { method: 'POST', body: JSON.stringify({ device_id: id, rate_type: v.rate_type, measurement: v.measurement, direction: v.direction, threshold, baseline_rate: baseline, recurring: v.recurring === true }) }); send(res, 201, rows[0]);
} catch (error) { fail(res, error); } }
