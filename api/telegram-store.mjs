import { randomUUID, createHash } from 'node:crypto';

export const SESSION_TTL = 1800;
export const UPDATE_TTL = 172800; // Longer than Telegram's 24-hour update retention.
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export function createTelegramStore(env, fetchImpl = globalThis.fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token || !/^https:\/\//.test(url)) throw new Error('Telegram store not configured');
  // Namespace by bot identity, not token: rotation must not erase deduplication.
  const botId = String(env.TELEGRAM_BOT_TOKEN).split(':')[0];
  const prefix = `cf:telegram:v1:${createHash('sha256').update(botId).digest('hex').slice(0, 16)}:`;
  async function command(args) {
    try {
      const response = await fetchImpl(url, { method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(args), signal: AbortSignal.timeout(2000) });
      const body = await response.json();
      if (!response.ok || body.error || !Object.hasOwn(body, 'result')) throw new Error();
      return body.result;
    } catch { throw new Error('Telegram store unavailable'); } // Never expose raw URLs/errors.
  }
  return {
    async get(key) { const value = await command(['GET', prefix + key]); return value ? JSON.parse(value) : null; },
    async put(key, value, ttl = SESSION_TTL) {
      const result = await command(['SET', prefix + key, JSON.stringify(value), 'EX', ttl]);
      if (result !== 'OK') throw new Error('Telegram store write not confirmed');
    },
    async remove(key) { await command(['DEL', prefix + key]); },
    async lock(key) {
      const owner = randomUUID();
      const result = await command(['SET', prefix + 'lock:' + key, owner, 'NX', 'EX', 60]);
      return result === 'OK' ? owner : null;
    },
    async unlock(key, owner) { await command(['EVAL', RELEASE, 1, prefix + 'lock:' + key, owner]); }
  };
}
