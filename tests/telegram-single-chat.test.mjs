import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramHandler } from '../api/telegram.mjs';
import { createTelegramStore } from '../api/telegram-store.mjs';

// Shared test backend simulates Redis across completely fresh serverless handlers.
function memoryStore() {
  const values = new Map(), locks = new Map();
  let seq = 0;
  return { values, locks, async get(k) { return structuredClone(values.get(k) || null); },
    async put(k, v) { values.set(k, structuredClone(v)); }, async remove(k) { values.delete(k); },
    async lock(k) { if (locks.has(k)) return null; const owner = String(++seq); locks.set(k, owner); return owner; },
    async unlock(k, owner) { if (locks.get(k) === owner) locks.delete(k); } };
}
const group = { id: -1003824051698, type: 'supergroup', is_forum: false };
const user = id => ({ id, is_bot: false });
const bot = { id: 999999, is_bot: true, username: 'calcuflowbot' };
const result = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function harness() {
  const store = memoryStore(), calls = [], panels = new Map(), logs = [];
  let updateId = 1, messageId = 100, clock = Date.now(), fail = null;
  const env = { TELEGRAM_BOT_TOKEN: '999999:SECRET_TOKEN', TELEGRAM_BOT_USERNAME: 'calcuflowbot',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret', TELEGRAM_ALLOWED_CHAT_ID: String(group.id),
    TELEGRAM_ALLOWED_THREAD_ID: '555', TELEGRAM_ALLOWED_THREADS: `${group.id}:777` };
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1), payload = JSON.parse(init?.body || '{}');
    calls.push({ method, payload });
    if (url.includes('api.telegram.org')) {
      if (fail) { const response = await fail(method, payload); if (response) return response; }
      if (method === 'sendMessage' || method === 'editMessageText') {
        const id = payload.message_id || ++messageId;
        const panel = { ...panels.get(id), ...payload, message_id: id,
          from: bot, chat: Number(payload.chat_id) > 0 ? { id: payload.chat_id, type: 'private' } : { ...group, id: payload.chat_id }, text: payload.text.replace(/[*_`]/g, '') };
        panels.set(id, panel);
        return result({ ok: true, result: panel });
      }
      return result({ ok: true, result: true });
    }
    if (method === 'dolares') return result([
      { moneda: 'USD', fuente: 'oficial', promedio: 68.5, fechaActualizacion: '2026-10-08T00:00:00Z' },
      { moneda: 'USD', fuente: 'paralelo', promedio: 75.2, fechaActualizacion: '2026-10-08T00:00:00Z' }
    ]);
    return result({}, 503); // Existing rate provider fallback, no financial engine mock.
  };
  const create = () => createTelegramHandler({ store, getEnv: () => env, fetchImpl,
    now: () => new Date(clock), logger: { info: x => logs.push(x), error: x => logs.push(x) } });
  const post = async (update, id = updateId++, secret = env.TELEGRAM_WEBHOOK_SECRET) => {
    const response = await create().fetch(new Request('https://example.test/api/telegram', {
      method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret },
      body: JSON.stringify({ update_id: id, ...update }) }));
    return { http: response.status, ...await response.json() };
  };
  const message = (text, owner = 101, extra = {}) => ({ message: {
    message_id: ++messageId, chat: group, from: user(owner), text, ...extra } });
  const command = (text = '/calcular@calcuflowbot', owner = 101, extra) => post(message(text, owner, extra));
  const clickUpdate = (panel, data, owner = 101) => ({ callback_query: {
    id: `query-${updateId}`, from: user(owner), message: panel, data } });
  const click = (panel, label, owner = 101) => {
    const button = panel.reply_markup.inline_keyboard.flat().find(b => b.text.includes(label));
    assert.ok(button, `Missing button ${label}`);
    return post(clickUpdate(panel, button.callback_data, owner));
  };
  const last = () => [...panels.values()].at(-1);
  const telegram = () => calls.filter(c => !['dolares', 'history.json', 'rate.json', 'search'].includes(c.method));
  return { store, env, calls, panels, logs, post, message, command, click, clickUpdate, last, telegram,
    advance: ms => { clock += ms; }, setFail: fn => { fail = fn; } };
}

test('production entrypoint: two ordinary members calculate concurrently in a topic-free group across fresh instances', async () => {
  const h = harness();
  const starts = await Promise.all([h.command(undefined, 101), h.command(undefined, 202)]);
  assert.ok(starts.every(r => r.status === 'banks_sent'));
  const [a, b] = [...h.panels.values()];
  assert.notEqual(a.message_id, b.message_id);
  assert.equal((await h.click(a, 'Banco de Venezuela', 101)).status, 'amounts_sent');
  assert.equal((await h.click(b, 'BNC', 202)).status, 'amounts_sent');
  const amountA = h.panels.get(a.message_id), amountB = h.panels.get(b.message_id);
  const wrong = await h.click(amountB, '500', 101);
  assert.equal(wrong.status, 'wrong_callback_owner');
  assert.match(h.calls.at(-1).payload.text, /otro usuario/);
  assert.equal(h.panels.get(b.message_id).text, amountB.text);
  await Promise.all([h.click(amountA, '100', 101), h.click(amountB, '500', 202)]);
  assert.match(h.panels.get(a.message_id).text, /Compra: 100,00 USD/);
  assert.match(h.panels.get(b.message_id).text, /Compra: 500,00 USD/);
  assert.ok(h.telegram().every(c => c.method !== 'deleteMessage' && !c.payload.message_thread_id && !c.payload.ephemeral_message_parameters));
  assert.ok(h.telegram().filter(c => /Message/.test(c.method)).every(c => c.payload.chat_id === group.id));
  assert.ok([...h.panels.values()].flatMap(p => p.reply_markup?.inline_keyboard?.flat() || [])
    .every(b => !b.callback_data || Buffer.byteLength(b.callback_data) <= 64));
});

test('exact prompt, sender and session validation; invalid input retry, consumed prompt and cancellation', async () => {
  const h = harness();
  await h.command(); const panelId = h.last().message_id;
  await h.click(h.last(), 'BNC');
  await h.click(h.panels.get(panelId), 'Otro monto');
  const prompt = h.last();
  assert.equal(prompt.reply_markup.force_reply, true);
  assert.equal((await h.post(h.message('375,50', 202, { reply_to_message: prompt }))).status, 'ignored_custom_reply_wrong_user');
  assert.equal((await h.post(h.message('texto', 101, { reply_to_message: prompt }))).status, 'custom_amount_invalid');
  const retry = h.last();
  assert.notEqual(retry.message_id, prompt.message_id);
  assert.equal((await h.post(h.message('375,50', 101, { reply_to_message: prompt }))).status, 'expired_prompt');
  assert.equal((await h.post(h.message('375,50', 101, { reply_to_message: retry }))).status, 'custom_calc_sent');
  assert.match(h.panels.get(panelId).text, /Compra: 375,50 USD/);
  assert.equal((await h.post(h.message('500', 101, { reply_to_message: retry }))).status, 'expired_prompt');
  assert.equal((await h.click(h.panels.get(panelId), 'Cancelar')).status, 'cancelled');
  assert.equal(h.panels.get(panelId).reply_markup.inline_keyboard.length, 0);
  assert.doesNotMatch(JSON.stringify([...h.store.values.values(), h.logs]), /375[,.]50|SECRET_TOKEN/);
});

test('old deployment buttons, expired sessions, replayed revisions and copied panels cannot mutate calculations', async () => {
  const h = harness();
  await h.command(); const initial = h.last();
  const data = initial.reply_markup.inline_keyboard[0][0].callback_data;
  await h.click(initial, 'Banco de Venezuela');
  assert.equal((await h.post(h.clickUpdate(initial, data))).status, 'expired_callback');
  assert.equal((await h.post(h.clickUpdate(initial, 'bank:bdv|u:101'))).status, 'expired_callback');
  const current = h.panels.get(initial.message_id);
  const copied = { ...current, message_id: 987654 };
  assert.equal((await h.click(copied, '100')).status, 'expired_callback');
  h.advance(1801 * 1000);
  assert.equal((await h.click(current, '100')).status, 'expired_callback');
  assert.match(h.calls.at(-1).payload.text, /venció.*calcular/);
});

test('duplicate updates create one panel; simultaneous delivery and storage failure do not acknowledge success', async () => {
  const h = harness(), update = h.message('/calcular');
  const outcomes = await Promise.all([h.post(update, 700), h.post(update, 700)]);
  assert.ok(outcomes.some(x => x.status === 'banks_sent'));
  assert.ok(outcomes.some(x => x.http === 503));
  assert.equal((await h.post(update, 700)).status, 'duplicate_update');
  assert.equal(h.calls.filter(c => c.method === 'sendMessage').length, 1);
  h.store.get = async () => { throw new Error('PRIVATE_INPUT_SECRET'); };
  assert.equal((await h.command()).http, 503);
  assert.doesNotMatch(JSON.stringify(h.logs), /PRIVATE_INPUT_SECRET/);
});

test('accepted callback recovers after result receipt/session write failure without sending twice', async () => {
  const h = harness(); await h.command(); const initial = h.last();
  const update = h.clickUpdate(initial, initial.reply_markup.inline_keyboard[0][0].callback_data);
  const originalPut = h.store.put;
  let failed = false;
  h.store.put = async (k, v, ttl) => {
    if (!failed && k.startsWith('panel:')) { failed = true; throw new Error('simulated restart'); }
    return originalPut(k, v, ttl);
  };
  assert.equal((await h.post(update, 900)).http, 503);
  assert.equal((await h.post(update, 900)).status, 'amounts_sent');
  assert.equal(h.calls.filter(c => c.method === 'editMessageText').length, 1);
  assert.equal((await h.post(update, 900)).status, 'duplicate_update');
});

test('ambiguous send persists uncertainty and never retries creation; definitive 429 can recover', async () => {
  const h = harness(), update = h.message('/calcular');
  h.setFail(method => method === 'sendMessage' ? result({ ok: false, error_code: 502 }, 502) : null);
  assert.equal((await h.post(update, 800)).http, 503);
  h.setFail(null);
  assert.equal((await h.post(update, 800)).http, 503);
  assert.equal(h.calls.filter(c => c.method === 'sendMessage').length, 1);
  const next = h.message('/calcular');
  h.setFail(method => method === 'sendMessage' ? result({ ok: false, error_code: 429, parameters: { retry_after: 30 } }, 429) : null);
  assert.equal((await h.post(next, 801)).http, 503);
  h.setFail(null);
  assert.equal((await h.post(next, 801)).http, 503);
  h.advance(31000);
  assert.equal((await h.post(next, 801)).status, 'banks_sent');
});

test('private commands and direct input remain supported; ignored group messages and other-bot commands do not fetch rates', async () => {
  const h = harness();
  assert.equal((await h.command('/calc 100 bdv', 101, { chat: { id: 101, type: 'private' } })).status, 'calc_sent');
  assert.equal((await h.command('250', 101, { chat: { id: 101, type: 'private' } })).status, 'calc_sent');
  const before = h.calls.length;
  for (const text of ['hola', '375', '/calcular@otro_bot']) await h.command(text);
  assert.equal(h.calls.length, before);
  assert.equal((await h.command('/calcular', 101, { message_thread_id: 777 })).status, 'banks_sent');
  assert.ok(h.calls.every(c => !c.payload.message_thread_id));
  assert.equal((await h.command('/calcular', 101, { chat: { id: -999, type: 'group' } })).status, 'ignored_external_group');
  const edited = { edited_message: h.message('/calcular').message };
  assert.equal((await h.post(edited)).status, 'ignored_edited_message');
});

test('one callback acknowledgement precedes mutation locks/provider work; webhook authentication is required', async () => {
  const h = harness(); await h.command(); const initial = h.last();
  const prior = h.calls.length;
  await h.click(initial, 'BNC');
  assert.equal(h.calls[prior].method, 'answerCallbackQuery');
  assert.equal(h.calls.slice(prior).filter(c => c.method === 'answerCallbackQuery').length, 1);
  assert.equal((await h.post(h.message('/calcular'), 1001, 'bad-secret')).http, 401);
  delete h.env.TELEGRAM_WEBHOOK_SECRET;
  assert.equal((await h.command()).http, 503);
});

test('Redis REST uses NX leases, expiry and owner-checked Lua unlock; no secret in keys/errors', async () => {
  const commands = [];
  const store = createTelegramStore({ TELEGRAM_BOT_TOKEN: '999:BOT_SECRET',
    UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'REDIS_SECRET' },
    async (_, init) => { commands.push(JSON.parse(init.body)); return result({ result: commands.at(-1)[0] === 'SET' ? 'OK' : null }); });
  const owner = await store.lock('update:1'); await store.unlock('update:1', owner);
  assert.deepEqual(commands[0].slice(-3), ['NX', 'EX', 60]);
  assert.equal(commands[1][0], 'EVAL'); assert.match(commands[1][1], /ARGV\[1\]/);
  await store.put('panel:1', { ownerId: '101' });
  assert.deepEqual(commands[2].slice(-2), ['EX', 1800]);
  assert.doesNotMatch(JSON.stringify(commands), /BOT_SECRET|REDIS_SECRET/);
  const bad = createTelegramStore({ TELEGRAM_BOT_TOKEN: '999:x', KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'secret' },
    async () => result({ error: 'PRIVATE_SECRET' }, 401));
  await assert.rejects(bad.get('x'), { message: 'Telegram store unavailable' });
});

test('same user can own two sessions; prompt from one session cannot supply the other panel', async () => {
  const h = harness();
  await h.command(); const first = h.last();
  await h.command(); const second = h.last();
  await h.click(first, 'BNC'); await h.click(h.panels.get(first.message_id), 'Otro monto');
  const promptA = h.last();
  await h.click(second, 'Banesco'); await h.click(h.panels.get(second.message_id), 'Otro monto');
  const promptB = h.last();
  const corrupted = { ...promptA, text: promptA.text.replace(`:${first.message_id}:`, `:${second.message_id}:`) };
  assert.equal((await h.post(h.message('200', 101, { reply_to_message: corrupted }))).status, 'expired_prompt');
  assert.equal((await h.post(h.message('200', 101, { reply_to_message: promptA }))).status, 'custom_calc_sent');
  assert.equal((await h.post(h.message('300', 101, { reply_to_message: promptB }))).status, 'custom_calc_sent');
  assert.match(h.panels.get(first.message_id).text, /Compra: 200,00 USD/);
  assert.match(h.panels.get(second.message_id).text, /Compra: 300,00 USD/);
});

test('permanent permission errors are recorded, return non-2xx and are not blindly retried', async () => {
  const h = harness(), update = h.message('/calcular');
  h.setFail(method => method === 'sendMessage' ? result({ ok: false, error_code: 403 }, 403) : null);
  assert.equal((await h.post(update, 2200)).http, 503);
  assert.equal((await h.post(update, 2200)).http, 503);
  assert.equal(h.calls.filter(c => c.method === 'sendMessage').length, 1);
});

test('private Stars prompt is validated and consumed; callbacks and invoices keep existing behavior', async () => {
  const h = harness(), privateChat = { id: 101, type: 'private' };
  await h.command('/apoyar', 101, { chat: privateChat });
  assert.equal((await h.click(h.last(), 'Otro monto')).status, 'custom_support_prompt_sent');
  const prompt = h.last();
  assert.equal((await h.post(h.message('750', 101, { chat: privateChat, reply_to_message: prompt }))).status, 'custom_support_invoice_sent');
  assert.equal((await h.post(h.message('750', 101, { chat: privateChat, reply_to_message: prompt }))).status, 'expired_prompt');
  assert.equal(h.calls.filter(c => c.method === 'sendInvoice').length, 1);
});

test('durable Redis configuration is required; production entrypoint never falls back to process memory', async () => {
  const handler = createTelegramHandler({ getEnv: () => ({ TELEGRAM_BOT_TOKEN: '999:test', TELEGRAM_WEBHOOK_SECRET: 'test' }),
    logger: { error() {} } });
  const response = await handler.fetch(new Request('https://test.invalid/api/telegram', { method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'test' }, body: JSON.stringify({ update_id: 1,
      message: { message_id: 10, from: user(101), chat: group, text: '/calcular' } }) }));
  assert.equal(response.status, 503);
});

test('new group calculations require a command; group conversation, forwarded prompts and expired replies do not mutate panels', async () => {
  const h = harness(); await h.command('/calc 100 bdv'); const panel = h.last();
  assert.equal((await h.click(panel, 'Nuevo cálculo')).status, 'command_required');
  assert.equal(h.panels.size, 1);
  await h.command(); const second = h.last();
  await h.click(second, 'BNC'); await h.click(h.panels.get(second.message_id), 'Otro monto');
  const prompt = h.last();
  const copied = { ...prompt, message_id: 333333 };
  assert.equal((await h.post(h.message('500', 101, { reply_to_message: copied }))).status, 'expired_prompt');
  const otherBot = { ...prompt, from: { id: 888888, is_bot: true, username: 'otherbot' } };
  assert.equal((await h.post(h.message('500', 101, { reply_to_message: otherBot }))).status, 'ignored_other_bot_reply');
  h.advance(1801 * 1000);
  assert.equal((await h.post(h.message('500', 101, { reply_to_message: prompt }))).status, 'expired_prompt');
  assert.match(h.panels.get(second.message_id).text, /Otro monto/);
});

test('Redis writes must explicitly confirm persistence before webhook processing can succeed', async () => {
  const store = createTelegramStore({ TELEGRAM_BOT_TOKEN: '999:x',
    UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'secret' },
    async () => result({ result: null }));
  await assert.rejects(store.put('update:1', { done: true }), { message: 'Telegram store write not confirmed' });
});

test('edit rate limits also defer webhook retries until retry_after', async () => {
  const h = harness(); await h.command(); const panel = h.last();
  const update = h.clickUpdate(panel, panel.reply_markup.inline_keyboard[0][0].callback_data);
  h.setFail(method => method === 'editMessageText' ? result({ ok: false, error_code: 429, parameters: { retry_after: 30 } }, 429) : null);
  assert.equal((await h.post(update, 2400)).http, 503);
  h.setFail(null);
  assert.equal((await h.post(update, 2400)).http, 503);
  assert.equal(h.calls.filter(c => c.method === 'editMessageText').length, 1);
  h.advance(31000);
  assert.equal((await h.post(update, 2400)).status, 'amounts_sent');
});
