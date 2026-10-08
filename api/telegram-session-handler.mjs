import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { createTelegramStore, SESSION_TTL, UPDATE_TTL } from './telegram-store.mjs';
import { getTelegramAccessContext } from './telegram-app-handler.mjs';
import { parseCustomAmountReply, parseCustomSupportReply } from './telegram-ui.mjs';

const EXPIRED = 'Este cálculo venció. Inicia otro con /calcular@calcuflowbot.';
const OTHER = 'Este cálculo es de otro usuario. Inicia el tuyo con /calcular@calcuflowbot.';
const digest = text => createHash('sha256').update(String(text)).digest('hex');
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' }
});

// Durable protection around the existing transport and calculation flow.
// Redis stores session metadata and operation receipts, never raw updates or custom amounts.
export function createDurableTelegramHandler({ createTransport, api, getEnv = () => process.env,
  fetchImpl = globalThis.fetch, now = () => new Date(), store: injectedStore, logger = console, ...options }) {
  const context = new AsyncLocalStorage();
  const timestamp = () => now().getTime();
  const sessionKey = (chat, panel) => `panel:${chat}:${panel}`;
  const active = session => session && session.expires > timestamp();
  const wrappedApi = {};
  for (const [method, fn] of Object.entries(api)) {
    wrappedApi[method] = async args => {
      const state = context.getStore();
      if (!state) return fn(args);
      // Callback acknowledgements have no calculation side effects; never delay for receipts.
      if (method === 'answerTelegramCallbackQuery') return { ok: true };
      const { store, updateId, userId } = state;
      const operation = state.operation++;
      const key = `operation:${updateId}:${operation}`;
      const previous = await store.get(key);
      if (previous?.pending) throw new Error('Telegram delivery requires reconciliation');
      if (previous?.failed || previous?.retryAt > timestamp()) {
        const error = new Error('Telegram operation rejected');
        error.category = previous.category;
        throw error;
      }
      const token = digest(`${updateId}:${operation}`).slice(0, 24);
      if (Date.now() >= state.deadline) throw new Error('Telegram invocation budget exhausted');
      const payload = { ...args, messageThreadId: null, timeoutMs: Math.max(1, Math.min(args.timeoutMs || 4000, state.deadline - Date.now())) };
      let session;
      if (payload.replyMarkup?.inline_keyboard?.length) {
        const current = payload.messageId ? await store.get(sessionKey(payload.chatId, payload.messageId)) : null;
        session = { chatId: String(payload.chatId), ownerId: String(userId), token,
          expires: current?.expires || state.startedAt + SESSION_TTL * 1000, actions: [] };
        payload.replyMarkup = { ...payload.replyMarkup, inline_keyboard: payload.replyMarkup.inline_keyboard.map(row =>
          row.map(button => {
            if (!button.callback_data) return button;
            // Start a new group calculation through an explicit command, never someone else's panel.
            const action = button.callback_data === 'new' && Number(payload.chatId) < 0 ? 'start_command' : button.callback_data;
            const index = session.actions.push(action) - 1;
            return { ...button, ...(action === 'cancel' ? { text: 'Cancelar' } : {}),
              callback_data: `cf1:${token}:${index}` };
          })) };
        if (!session.actions.includes('cancel')) {
          const index = session.actions.push('cancel') - 1;
          payload.replyMarkup.inline_keyboard.push([{ text: 'Cancelar', callback_data: `cf1:${token}:${index}` }]);
        }
      }
      let result;
      if (previous?.result) result = previous.result;
      else {
        // Before message creation, durably record uncertainty. A crash/timeout must not resend blindly.
        const creates = method === 'sendTelegramMessage' || method === 'sendTelegramInvoice';
        if (creates) await store.put(key, { pending: true }, UPDATE_TTL);
        try {
          result = await fn(payload);
        } catch (error) {
          if (error.category === 'rate_limited') {
            await store.put(key, { category: error.category,
              retryAt: timestamp() + Math.max(1, error.retryAfter || 1) * 1000 }, UPDATE_TTL);
          } else if (!['network', 'timeout', 'server', 'invalid_response'].includes(error.category)) {
            // Explicit permanent rejection, including edits: retain it rather than loop.
            await store.put(key, { failed: true, category: error.category || 'unknown' }, UPDATE_TTL);
          }
          throw error;
        }
        // Persist only delivery identity, not message text, inputs, or Telegram response contents.
        result = { ok: true, ...(result?.noOp ? { noOp: true } : {}),
          ...(result?.result?.message_id ? { result: { message_id: result.result.message_id } } : {}) };
        await store.put(key, { result }, UPDATE_TTL);
      }
      const panelId = payload.messageId || result?.result?.message_id;
      if (session && panelId) {
        session.messageId = panelId;
        await store.put(`button:${token}`, session);
        await store.put(sessionKey(payload.chatId, panelId), session);
      }
      // A prompt is valid only while this exact panel is waiting for this exact message.
      if (method === 'sendTelegramMessage' && payload.replyMarkup?.force_reply && panelId) {
        const fake = { reply_to_message: { text: payload.text, from: { is_bot: true }, message_id: panelId } };
        const parsed = parseCustomAmountReply(fake) || parseCustomSupportReply(fake);
        if (parsed) {
          const parent = parsed.panelMessageId ? await store.get(sessionKey(payload.chatId, parsed.panelMessageId)) : null;
          const prompt = { chatId: String(payload.chatId), ownerId: String(userId),
            messageId: panelId, panelId: parsed.panelMessageId || null,
            expires: parent?.expires || state.startedAt + SESSION_TTL * 1000 };
          // Telegram strips Markdown; compare reference metadata below, not displayed text.
          prompt.bankId = parsed.bankId || null;
          await store.put(`prompt:${payload.chatId}:${panelId}`, prompt);
          if (parent) await store.put(sessionKey(payload.chatId, parsed.panelMessageId), { ...parent, promptId: panelId });
        }
      }
      return result;
    };
  }
  const transport = createTransport({ ...options, getEnv, fetchImpl, now, logger, api: wrappedApi });
  async function notify(query, botToken, text) {
    if (context.getStore()?.callbackAcknowledged) return;
    try { await api.answerTelegramCallbackQuery({ fetchImpl, botToken, callbackQueryId: query.id, text,
      timeoutMs: 1000 }); } catch { /* A failed notification must not authorize a mutation. */ }
  }
  async function process(update, env, state) {
    const query = update.callback_query;
    const message = query?.message || update.message;
    const chat = message?.chat;
    const access = getTelegramAccessContext(chat, null, env);
    const routeKey = `route:${state.updateId}`;
    const accepted = await state.store.get(routeKey);
    if (query) {
      if (accepted?.kind === 'callback') {
        update = { ...update, callback_query: { ...query, data: accepted.action } };
        return transport.fetch(new Request('https://local.invalid/api/telegram', {
          method: 'POST', body: JSON.stringify(update) }));
      }
      const match = String(query.data || '').match(/^cf1:([a-f0-9]{24}):(\d+)$/);
      const session = match ? await state.store.get(`button:${match[1]}`) : null;
      if (session?.ownerId !== String(query.from?.id) && active(session)) {
        await notify(query, env.TELEGRAM_BOT_TOKEN, OTHER);
        return json({ ok: true, status: 'wrong_callback_owner' });
      }
      const panel = session ? await state.store.get(sessionKey(chat?.id, message?.message_id)) : null;
      if (!access.allowed || !active(session) || session.chatId !== String(chat?.id) ||
          session.messageId !== message?.message_id || panel?.token !== session.token ||
          !session.actions[Number(match?.[2])]) {
        await notify(query, env.TELEGRAM_BOT_TOKEN, EXPIRED);
        return json({ ok: true, status: 'expired_callback' });
      }
      const action = session.actions[Number(match[2])];
      if (action === 'start_command') {
        await notify(query, env.TELEGRAM_BOT_TOKEN, 'Escribe /calcular@calcuflowbot para iniciar otro cálculo.');
        return json({ ok: true, status: 'command_required' });
      }
      if (action === 'cancel') {
        await notify(query, env.TELEGRAM_BOT_TOKEN, 'Cálculo cancelado.');
        await wrappedApi.editTelegramMessageText({ fetchImpl, botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: chat.id, messageId: message.message_id, text: 'Cálculo cancelado. Usa /calcular para iniciar otro.',
          replyMarkup: { inline_keyboard: [] } });
        await state.store.remove(sessionKey(chat.id, message.message_id));
        return json({ ok: true, status: 'cancelled' });
      }
      await state.store.put(routeKey, { kind: 'callback', action }, UPDATE_TTL);
      update = { ...update, callback_query: { ...query, data: action } };
    } else if (message?.reply_to_message && !String(message.text || '').startsWith('/')) {
      const reply = message.reply_to_message;
      const expectedUser = String(env.TELEGRAM_BOT_USERNAME || 'calcuflowbot').replace(/^@/, '').toLowerCase();
      const botId = String(env.TELEGRAM_BOT_TOKEN).split(':')[0];
      const own = reply.from?.is_bot && (String(reply.from.id) === botId ||
        String(reply.from.username || '').toLowerCase() === expectedUser);
      if (!accepted && own && /CF-(MONTO|STARS)/.test(reply.text || '')) {
        const prompt = await state.store.get(`prompt:${chat.id}:${reply.message_id}`);
        const parsed = parseCustomAmountReply(message) || parseCustomSupportReply(message);
        const panel = prompt?.panelId ? await state.store.get(sessionKey(chat.id, prompt.panelId)) : null;
        if (prompt?.ownerId !== String(message.from?.id) && active(prompt)) {
          return json({ ok: true, status: 'ignored_custom_reply_wrong_user' });
        }
        if (!active(prompt) || !parsed || String(parsed.ownerId) !== String(message.from?.id) ||
            prompt.chatId !== String(chat.id) || parsed.panelMessageId !== (prompt.panelId || undefined) ||
            (parsed.bankId || null) !== prompt.bankId ||
            (prompt.panelId && (!active(panel) || panel.promptId !== reply.message_id))) {
          await wrappedApi.sendTelegramMessage({ fetchImpl, botToken: env.TELEGRAM_BOT_TOKEN,
            chatId: chat.id, replyToMessageId: message.message_id, text: EXPIRED });
          return json({ ok: true, status: 'expired_prompt' });
        }
        await state.store.put(routeKey, { kind: 'reply' }, UPDATE_TTL);
      }
    }
    const response = await transport.fetch(new Request('https://local.invalid/api/telegram', {
      method: 'POST', body: JSON.stringify(update) }));
    if (response.ok && message?.reply_to_message) {
      const body = await response.clone().json();
      if (body.ok && /^(custom_|invoice_)/.test(body.status)) {
        await state.store.remove(`prompt:${chat.id}:${message.reply_to_message.message_id}`);
      }
    }
    return response;
  }
  return { async fetch(request) {
    if (request.method !== 'POST') return transport.fetch(request);
    const env = getEnv();
    if (!env.TELEGRAM_WEBHOOK_SECRET) return json({ ok: false, status: 'webhook_secret_missing' }, 503);
    if (request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
      return json({ ok: false, status: 'unauthorized' }, 401);
    }
    let update;
    try { update = await request.json(); } catch { return json({ error: 'JSON no válido.' }, 400); }
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) return json({ error: 'update_id no válido.' }, 400);
    // Edited messages must not restart or silently change a financial operation.
    if (update.edited_message) return json({ ok: true, status: 'ignored_edited_message' });
    const message = update.callback_query?.message || update.message;
    const access = getTelegramAccessContext(message?.chat, null, env);
    if (message && !access.allowed) {
      if (update.callback_query) await notify(update.callback_query, env.TELEGRAM_BOT_TOKEN, 'Este grupo no está autorizado.');
      return json({ ok: true, status: 'ignored_external_group' });
    }
    if (update.message?.from?.is_bot || update.message?.sender_chat) return json({ ok: true, status: 'ignored_non_user_message' });
    let store, lock, userLock, callbackAcknowledged = false;
    const userId = update.callback_query?.from?.id || update.message?.from?.id || update.pre_checkout_query?.from?.id;
    const userKey = `user:${message?.chat?.id || userId}:${userId}`;
    const updateKey = `update:${update.update_id}`;
    try {
      store = injectedStore || createTelegramStore(env, fetchImpl);
      // Give one useful callback answer before locks or rate-provider work. A small
      // metadata read permits an owner/expiry notification rather than a second answer.
      const recorded = await store.get(updateKey);
      if (recorded?.done) {
        if (update.callback_query) await notify(update.callback_query, env.TELEGRAM_BOT_TOKEN);
        return json({ ok: true, status: 'duplicate_update' });
      }
      if (update.callback_query) {
        const query = update.callback_query;
        const accepted = recorded ? await store.get(`route:${update.update_id}`) : null;
        if (!accepted) {
          const match = String(query.data || '').match(/^cf1:([a-f0-9]{24}):(\d+)$/);
          const session = match ? await store.get(`button:${match[1]}`) : null;
          if (active(session) && session.ownerId !== String(query.from?.id)) {
            await notify(query, env.TELEGRAM_BOT_TOKEN, OTHER);
            return json({ ok: true, status: 'wrong_callback_owner' });
          }
          const panel = session ? await store.get(sessionKey(message?.chat?.id, message?.message_id)) : null;
          if (!active(session) || session.chatId !== String(message?.chat?.id) ||
              session.messageId !== message?.message_id || panel?.token !== session.token ||
              !session.actions[Number(match?.[2])]) {
            await notify(query, env.TELEGRAM_BOT_TOKEN, EXPIRED);
            return json({ ok: true, status: 'expired_callback' });
          }
          if (session.actions[Number(match[2])] === 'start_command') {
            await notify(query, env.TELEGRAM_BOT_TOKEN, 'Escribe /calcular@calcuflowbot para iniciar otro cálculo.');
            return json({ ok: true, status: 'command_required' });
          }
        }
        await notify(query, env.TELEGRAM_BOT_TOKEN);
        callbackAcknowledged = true;
      }
      lock = await store.lock(updateKey);
      if (!lock) return json({ ok: false, status: 'processing' }, 503);
      const done = await store.get(updateKey);
      if (done?.done) {
        return json({ ok: true, status: 'duplicate_update' });
      }
      userLock = await store.lock(userKey);
      if (!userLock) {
        return json({ ok: false, status: 'processing' }, 503);
      }
      const startedAt = done?.startedAt || timestamp();
      if (!done) await store.put(updateKey, { startedAt }, UPDATE_TTL);
      const state = { store, updateId: update.update_id, operation: 0, userId, startedAt, callbackAcknowledged, deadline: Date.now() + 45000 };
      const response = await context.run(state, () => process(update, env, state));
      const body = await response.clone().json();
      if (!response.ok || body.ok === false) return json(body, 503);
      await store.put(updateKey, { done: true }, UPDATE_TTL);
      return response;
    } catch {
      if (update.callback_query && !callbackAcknowledged) await notify(update.callback_query, env.TELEGRAM_BOT_TOKEN, 'No se pudo procesar. Inicia otro con /calcular.');
      try { logger?.error?.({ event: 'telegram_durable_failure', outcome: 'failed' }); } catch {}
      return json({ ok: false, status: 'processing_failed', retry: true }, 503);
    } finally {
      // Release only our own lease; never delete a newer invocation's lock.
      try { if (userLock) await store.unlock(userKey, userLock); } catch {}
      try { if (lock) await store.unlock(updateKey, lock); } catch {}
    }
  } };
}
