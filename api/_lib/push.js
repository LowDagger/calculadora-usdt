import webpush from 'web-push';
import { db } from './http.js';
export function configurePush() { webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY); }
export async function deliver(deviceId, payload) {
  configurePush(); const subscriptions = await db(`push_subscriptions?device_id=eq.${deviceId}&select=id,endpoint,p256dh,auth`); let delivered = 0;
  for (const sub of subscriptions || []) { try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 300 }); delivered++; } catch (error) { if ([404, 410].includes(error.statusCode)) await db(`push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE', prefer: 'return=minimal' }); else console.error('Push delivery failed', error.statusCode || 'unknown'); } }
  return delivered;
}
