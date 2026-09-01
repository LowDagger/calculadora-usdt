import { createTelegramAppHandler } from './telegram-app-handler.mjs';

const REQUEST_TIMEOUT_MS = 8000;

function telegramMethodUrl(botToken, method, testMode = false) {
  const environmentPath = testMode ? '/test' : '';
  return `https://api.telegram.org/bot${botToken}${environmentPath}/${method}`;
}

class TelegramApiError extends Error {
  constructor(method, status = null) {
    const statusSuffix = Number.isInteger(status) ? ` (HTTP ${status})` : '';
    super(`Telegram ${method} failed${statusSuffix}.`);
    this.name = 'TelegramApiError';
    this.status = status;
  }
}

function requireTelegramSuccess(response, method) {
  if (!response?.ok) {
    throw new TelegramApiError(method, response?.status);
  }
  return response;
}

export async function sendTelegramMessage({
  fetchImpl = globalThis.fetch,
  botToken,
  chatId,
  text,
  replyToMessageId = null,
  replyMarkup = null,
  messageThreadId = null,
  linkPreviewOptions = { is_disabled: true },
  ephemeralMessageParameters = null,
  testMode = false,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!botToken || !chatId || !text) {
    throw new Error('Missing required Telegram sendMessage parameters');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  };
  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  if (messageThreadId) {
    payload.message_thread_id = messageThreadId;
  }
  if (linkPreviewOptions) {
    payload.link_preview_options = linkPreviewOptions;
  }
  if (ephemeralMessageParameters) {
    payload.ephemeral_message_parameters = ephemeralMessageParameters;
  }

  try {
    const response = await fetchImpl(telegramMethodUrl(botToken, 'sendMessage', testMode), {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      // If Markdown formatting failed upstream, attempt plain-text fallback
      if (response.status === 400) {
        const plainPayload = {
          chat_id: chatId,
          text: text.replace(/[*_`]/g, '')
        };
        if (replyToMessageId) {
          plainPayload.reply_to_message_id = replyToMessageId;
        }
        if (replyMarkup) {
          plainPayload.reply_markup = replyMarkup;
        }
        if (messageThreadId) {
          plainPayload.message_thread_id = messageThreadId;
        }
        if (linkPreviewOptions) {
          plainPayload.link_preview_options = linkPreviewOptions;
        }
        if (ephemeralMessageParameters) {
          plainPayload.ephemeral_message_parameters = ephemeralMessageParameters;
        }
        const fallbackResponse = await fetchImpl(telegramMethodUrl(botToken, 'sendMessage', testMode), {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(plainPayload),
          signal: controller.signal
        });
        return requireTelegramSuccess(fallbackResponse, 'sendMessage');
      }
    }
    return requireTelegramSuccess(response, 'sendMessage');
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    throw new TelegramApiError('sendMessage');
  } finally {
    clearTimeout(timeout);
  }
}

export async function answerTelegramCallbackQuery({
  fetchImpl = globalThis.fetch,
  botToken,
  callbackQueryId,
  text = null,
  showAlert = false,
  testMode = false,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!botToken || !callbackQueryId) {
    throw new Error('Missing required Telegram answerCallbackQuery parameters');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    callback_query_id: callbackQueryId
  };
  if (text) {
    payload.text = text;
  }
  if (showAlert) {
    payload.show_alert = true;
  }

  try {
    const response = await fetchImpl(telegramMethodUrl(botToken, 'answerCallbackQuery', testMode), {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return requireTelegramSuccess(response, 'answerCallbackQuery');
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    throw new TelegramApiError('answerCallbackQuery');
  } finally {
    clearTimeout(timeout);
  }
}

export async function editTelegramMessageText({
  fetchImpl = globalThis.fetch,
  botToken,
  chatId,
  messageId,
  text,
  replyMarkup = null,
  linkPreviewOptions = { is_disabled: true },
  testMode = false,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!botToken || !chatId || !messageId || !text) {
    throw new Error('Missing required Telegram editMessageText parameters');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'Markdown'
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  if (linkPreviewOptions) {
    payload.link_preview_options = linkPreviewOptions;
  }

  try {
    const response = await fetchImpl(telegramMethodUrl(botToken, 'editMessageText', testMode), {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 400) {
        const plainPayload = {
          chat_id: chatId,
          message_id: messageId,
          text: text.replace(/[*_`]/g, '')
        };
        if (replyMarkup) {
          plainPayload.reply_markup = replyMarkup;
        }
        if (linkPreviewOptions) {
          plainPayload.link_preview_options = linkPreviewOptions;
        }
        const fallbackResponse = await fetchImpl(telegramMethodUrl(botToken, 'editMessageText', testMode), {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(plainPayload),
          signal: controller.signal
        });
        return requireTelegramSuccess(fallbackResponse, 'editMessageText');
      }
    }
    return requireTelegramSuccess(response, 'editMessageText');
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    throw new TelegramApiError('editMessageText');
  } finally {
    clearTimeout(timeout);
  }
}

async function postTelegramMethod({
  fetchImpl = globalThis.fetch,
  botToken,
  method,
  payload,
  testMode = false,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!botToken || !method) throw new Error('Missing required Telegram API parameters');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(telegramMethodUrl(botToken, method, testMode), {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return requireTelegramSuccess(response, method);
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    throw new TelegramApiError(method);
  } finally {
    clearTimeout(timeout);
  }
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
