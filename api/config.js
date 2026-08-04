import { cors, send } from './_lib/http.js';
export default function handler(req, res) { if (!cors(req, res, 'GET, OPTIONS')) return; if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' }); send(res, 200, { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' }); }
