import { createTelegramAppHandler } from './telegram-app-handler.mjs';

const REQUEST_TIMEOUT_MS = 8000;

function telegramMethodUrl(botToken, method, testMode = false) {
  const environmentPath = testMode ? '/test' : '';
  return `https://api.telegram.org/bot${botToken}${environmentPath}/${method}`;
}

export class TelegramApiError extends Error {
  constructor(method, status = null, { errorCode = null, category = 'unknown', retryAfter = null } = {}) {
    super(`Telegram ${method} failed${Number.isInteger(status) ? ` (HTTP ${status})` : ''}.`);
    this.name = 'TelegramApiError';
    Object.assign(this, { method, status, errorCode, category, retryAfter });
  }
}

export function classifyTelegramError(status, body = {}) {
  const code = body.error_code;
  const description = String(body.description || '').toLowerCase();
  if (status === 429 || code === 429) return 'rate_limited';
  if (status >= 500 || code >= 500) return 'server';
  if (status === 401 || status === 403 || code === 401 || code === 403 || /not enough rights|have no rights|bot was blocked|chat_write_forbidden/.test(description)) return 'permission';
  if (/message is not modified/.test(description)) return 'not_modified';
  if (/can't parse entities|cannot parse entities|can't find end of|unsupported start tag|entity.*(offset|length)/.test(description)) return 'formatting';
  if (/message thread not found|topic_closed|topic_deleted/.test(description)) return 'missing_thread';
  if (/message to edit not found|message can't be edited|message_id_invalid/.test(description)) return 'missing_message';
  if (/message to be replied not found|reply message not found/.test(description)) return 'missing_reply';
  return 'unknown';
}

// One deadline covers retries AND response-body reads. Never repeat an ambiguous send.
async function postTelegramMethod({ fetchImpl = globalThis.fetch, botToken, method, payload,
  testMode = false, timeoutMs = REQUEST_TIMEOUT_MS }) {
  if (!botToken || !method) throw new Error('Missing required Telegram API parameters');
  const deadline = Date.now() + timeoutMs;
  const createsMessage = method === 'sendMessage' || method === 'sendInvoice';
  let current = { ...payload };
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new TelegramApiError(method, null, { category: 'timeout' });
    let timer;
    let error;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new TelegramApiError(method, null, { category: 'timeout' }));
        }, remaining);
      });
      const result = await Promise.race([(async () => {
        const response = await fetchImpl(telegramMethodUrl(botToken, method, testMode), {
          method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json' },
          body: JSON.stringify(current), signal: controller.signal
        });
        let body;
        try { body = await response.json(); } catch { body = null; }
        if (response.ok && body?.ok === true) return body;
        const category = classifyTelegramError(response.status, body || {});
        throw new TelegramApiError(method, response.status, {
          errorCode: body?.error_code ?? null,
          category: body || category !== 'unknown' ? category : 'invalid_response',
          retryAfter: Number.isFinite(body?.parameters?.retry_after) ? body.parameters.retry_after : null
        });
      })(), timeout]);
      return result;
    } catch (caught) {
      error = caught instanceof TelegramApiError ? caught : new TelegramApiError(method, null, {
        category: caught?.name === 'AbortError' ? 'timeout' : 'network'
      });
    } finally { clearTimeout(timer); }
    if (method === 'editMessageText' && error.category === 'not_modified') return { ok: true, noOp: true };
    if (attempt === 2) throw error;
    if (error.category === 'formatting' && current.parse_mode) {
      delete current.parse_mode;
      current.text = current.text.replace(/[*_`]/g, '');
      continue;
    }
    if (method === 'sendMessage' && error.category === 'missing_reply' && current.reply_to_message_id) {
      delete current.reply_to_message_id;
      continue;
    }
    if (method === 'sendMessage' && error.category === 'missing_thread' && current.message_thread_id) {
      delete current.message_thread_id;
      delete current.reply_to_message_id;
      continue;
    }
    const safeTransient = error.category === 'rate_limited' ||
      (!createsMessage && ['server', 'network', 'timeout'].includes(error.category));
    const delay = error.category === 'rate_limited' ? Math.max(0, (error.retryAfter ?? 1) * 1000) : 100;
    if (!safeTransient || delay > 1000 || deadline - Date.now() < delay + 100) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

export async function sendTelegramMessage({ fetchImpl = globalThis.fetch, botToken, chatId, text,
  replyToMessageId = null, replyMarkup = null, messageThreadId = null,
  linkPreviewOptions = { is_disabled: true }, ephemeralMessageParameters = null,
  testMode = false, timeoutMs = REQUEST_TIMEOUT_MS }) {
  if (!botToken || !chatId || !text) throw new Error('Missing required Telegram sendMessage parameters');
  const payload = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (messageThreadId) payload.message_thread_id = messageThreadId;
  if (linkPreviewOptions) payload.link_preview_options = linkPreviewOptions;
  if (ephemeralMessageParameters) payload.ephemeral_message_parameters = ephemeralMessageParameters;
  return postTelegramMethod({ fetchImpl, botToken, method: 'sendMessage', payload, testMode, timeoutMs });
}

export async function editTelegramMessageText({ fetchImpl = globalThis.fetch, botToken, chatId, messageId, text,
  replyMarkup = null, linkPreviewOptions = { is_disabled: true }, testMode = false, timeoutMs = REQUEST_TIMEOUT_MS }) {
  if (!botToken || !chatId || !messageId || !text) throw new Error('Missing required Telegram editMessageText parameters');
  const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (linkPreviewOptions) payload.link_preview_options = linkPreviewOptions;
  return postTelegramMethod({ fetchImpl, botToken, method: 'editMessageText', payload, testMode, timeoutMs });
}

export async function answerTelegramCallbackQuery({ fetchImpl = globalThis.fetch, botToken, callbackQueryId,
  text = null, showAlert = false, testMode = false, timeoutMs = REQUEST_TIMEOUT_MS }) {
  if (!botToken || !callbackQueryId) throw new Error('Missing required Telegram answerCallbackQuery parameters');
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  if (showAlert) payload.show_alert = true;
  return postTelegramMethod({ fetchImpl, botToken, method: 'answerCallbackQuery', payload, testMode, timeoutMs });
}

export async function deleteTelegramMessage({
  fetchImpl = globalThis.fetch,
  botToken,
  chatId,
  messageId,
  testMode = false,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!chatId || !messageId) throw new Error('Missing required Telegram deleteMessage parameters');
  return postTelegramMethod({
    fetchImpl,
    botToken,
    method: 'deleteMessage',
    payload: { chat_id: chatId, message_id: messageId },
    timeoutMs,
    testMode
  });
}

export async function sendTelegramInvoice({
  fetchImpl = globalThis.fetch,
  botToken,
  chatId,
  title,
  description,
  payload,
  amount,
  messageThreadId = null,
  testMode = false,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!chatId || !title || !description || !payload || !Number.isInteger(amount)) {
    throw new Error('Missing required Telegram sendInvoice parameters');
  }
  const requestPayload = {
    chat_id: chatId,
    title,
    description,
    payload,
    currency: 'XTR',
    prices: [{ label: 'Apoyo voluntario a CalcuFlow', amount }]
  };
  if (messageThreadId) requestPayload.message_thread_id = messageThreadId;
  return postTelegramMethod({ fetchImpl, botToken, method: 'sendInvoice', payload: requestPayload, timeoutMs, testMode });
}

export async function answerTelegramPreCheckoutQuery({
  fetchImpl = globalThis.fetch,
  botToken,
  preCheckoutQueryId,
  ok,
  errorMessage = null,
  testMode = false,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!preCheckoutQueryId) throw new Error('Missing required Telegram answerPreCheckoutQuery parameters');
  const payload = { pre_checkout_query_id: preCheckoutQueryId, ok: Boolean(ok) };
  if (!ok && errorMessage) payload.error_message = errorMessage;
  return postTelegramMethod({ fetchImpl, botToken, method: 'answerPreCheckoutQuery', payload, timeoutMs, testMode });
}

export function isChatAuthorized(chatId, allowedChatIdSetting) {
  if (!allowedChatIdSetting || typeof allowedChatIdSetting !== 'string' || !allowedChatIdSetting.trim()) {
    return true; // No restriction configured
  }

  const allowedIds = allowedChatIdSetting
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (allowedIds.length === 0) return true;

  const currentIdStr = String(chatId).trim();
  return allowedIds.some(allowed => allowed === currentIdStr);
}

export function createTelegramHandler(options = {}) {
  return createTelegramAppHandler({
    ...options,
    api: {
      sendTelegramMessage,
      answerTelegramCallbackQuery,
      editTelegramMessageText,
      deleteTelegramMessage,
      sendTelegramInvoice,
      answerTelegramPreCheckoutQuery
    }
  });
}

export default createTelegramHandler();
