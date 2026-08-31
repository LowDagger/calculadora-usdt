import { resolveServerRates } from './rate-providers.mjs';
import { calculateValues, DEFAULT_BPAY_FEE } from '../js/calculator.js';
import {
  parseTelegramMessage,
  resolveBank,
  formatCalculationResult,
  formatRatesMessage,
  formatHelpMessage,
  formatErrorMessage,
  buildBankInlineKeyboard,
  buildQuickAmountsInlineKeyboard,
  parseCallbackData
} from './telegram-formatter.mjs';

const NO_STORE = 'private, no-store';
const REQUEST_TIMEOUT_MS = 8000;

function json(body, { status = 200 } = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': NO_STORE
  });
  return new Response(JSON.stringify(body), { status, headers });
}

export async function sendTelegramMessage({
  fetchImpl = globalThis.fetch,
  botToken,
  chatId,
  text,
  replyToMessageId = null,
  replyMarkup = null,
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

  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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
        await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(plainPayload),
          signal: controller.signal
        }).catch(() => null);
      }
    }
    return response;
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
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return response;
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

  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/editMessageText`, {
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
        await fetchImpl(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(plainPayload),
          signal: controller.signal
        }).catch(() => null);
      }
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
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

export function createTelegramHandler({
  fetchImpl = globalThis.fetch,
  getEnv = () => process.env,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  return {
    async fetch(request) {
      if (request.method !== 'POST') {
        return json({ error: 'Método no permitido.' }, { status: 405 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'JSON no válido.' }, { status: 400 });
      }

      const update = body;
      const callbackQuery = update?.callback_query;

      // Handle Telegram Callback Queries (Inline Keyboard Buttons)
      if (callbackQuery && typeof callbackQuery === 'object') {
        const callbackQueryId = callbackQuery.id;
        const chatId = callbackQuery.message?.chat?.id || callbackQuery.from?.id;
        const messageId = callbackQuery.message?.message_id;
        const data = callbackQuery.data;

        const env = typeof getEnv === 'function' ? getEnv() : process.env;
        const botToken = env?.TELEGRAM_BOT_TOKEN;
        const allowedChatId = env?.TELEGRAM_ALLOWED_CHAT_ID;

        if (!botToken) {
          return json({ error: 'TELEGRAM_BOT_TOKEN no configurado.' }, { status: 500 });
        }

        // Check chat authorization
        if (chatId && !isChatAuthorized(chatId, allowedChatId)) {
          if (callbackQueryId) {
            try {
              await answerTelegramCallbackQuery({
                fetchImpl,
                botToken,
                callbackQueryId,
                text: '⚠️ No autorizado.',
                showAlert: true,
                timeoutMs
              });
            } catch {
              // Ignore network errors
            }
          }
          return json({ ok: true, status: 'unauthorized_chat' });
        }

        // Immediately answer callback query to clear button loading state
        if (callbackQueryId) {
          try {
            await answerTelegramCallbackQuery({
              fetchImpl,
              botToken,
              callbackQueryId,
              timeoutMs
            });
          } catch {
            // Ignore answer error
          }
        }

        const parsedCallback = parseCallbackData(data);

        if (parsedCallback.type === 'rates') {
          try {
            const ratesResult = await resolveServerRates({ fetchImpl, now, timeoutMs });
            if (!ratesResult.bcv?.ok || !ratesResult.p2p?.ok) {
              if (chatId && messageId) {
                await editTelegramMessageText({
                  fetchImpl,
                  botToken,
                  chatId,
                  messageId,
                  text: formatErrorMessage('No se pudieron consultar las tasas en este momento. Intenta de nuevo en unos minutos.'),
                  replyMarkup: buildQuickAmountsInlineKeyboard(),
                  timeoutMs
                });
              }
              return json({ ok: true, status: 'rates_unavailable' });
            }

            const ratesText = formatRatesMessage({
              bcv: ratesResult.bcv.rate,
              p2p: ratesResult.p2p.rate,
              bcvDate: ratesResult.bcv.effectiveDate
            });

            if (chatId && messageId) {
              await editTelegramMessageText({
                fetchImpl,
                botToken,
                chatId,
                messageId,
                text: ratesText,
                replyMarkup: buildQuickAmountsInlineKeyboard(),
                timeoutMs
              });
            }
            return json({ ok: true, status: 'rates_sent' });
          } catch {
            if (chatId && messageId) {
              await editTelegramMessageText({
                fetchImpl,
                botToken,
                chatId,
                messageId,
                text: formatErrorMessage('Error al consultar los proveedores de tasas.'),
                timeoutMs
              });
            }
            return json({ ok: true, status: 'rates_error' });
          }
        }

        if (parsedCallback.type === 'calc') {
          try {
            const ratesResult = await resolveServerRates({ fetchImpl, now, timeoutMs });
            if (!ratesResult.bcv?.ok || !ratesResult.p2p?.ok) {
              if (chatId && messageId) {
                await editTelegramMessageText({
                  fetchImpl,
                  botToken,
                  chatId,
                  messageId,
                  text: formatErrorMessage('No se pudieron obtener las tasas actuales para calcular. Intenta de nuevo en unos minutos.'),
                  timeoutMs
                });
              }
              return json({ ok: true, status: 'rates_unavailable' });
            }

            const bank = resolveBank(parsedCallback.bankId);
            const calcResult = calculateValues({
              requestedUsd: parsedCallback.amount,
              bcvRate: ratesResult.bcv.rate,
              bankMargin: 0,
              p2pRate: ratesResult.p2p.rate,
              cardFee: bank.fee,
              bpayFee: DEFAULT_BPAY_FEE
            });

            if (!calcResult) {
              if (chatId && messageId) {
                await editTelegramMessageText({
                  fetchImpl,
                  botToken,
                  chatId,
                  messageId,
                  text: formatErrorMessage('No se pudo calcular la operación con los valores proporcionados.'),
                  timeoutMs
                });
              }
              return json({ ok: true, status: 'calc_failed' });
            }

            const responseText = formatCalculationResult(calcResult, bank);
            const replyMarkup = buildBankInlineKeyboard(parsedCallback.amount, bank.id);

            if (chatId && messageId) {
              await editTelegramMessageText({
                fetchImpl,
                botToken,
                chatId,
                messageId,
                text: responseText,
                replyMarkup,
                timeoutMs
              });
            }
            return json({ ok: true, status: 'calc_sent' });
          } catch {
            if (chatId && messageId) {
              await editTelegramMessageText({
                fetchImpl,
                botToken,
                chatId,
                messageId,
                text: formatErrorMessage('Error interno al procesar el cálculo.'),
                timeoutMs
              });
            }
            return json({ ok: true, status: 'calc_error' });
          }
        }

        return json({ ok: true, status: 'ignored_unknown_callback' });
      }

      // Handle standard message updates
      const message = update?.message || update?.edited_message;
      if (!message || typeof message !== 'object') {
        return json({ ok: true, status: 'ignored_no_message' });
      }

      const chatId = message.chat?.id;
      const messageId = message.message_id;
      const text = message.text;

      if (!chatId || !text) {
        return json({ ok: true, status: 'ignored_no_text' });
      }

      const env = typeof getEnv === 'function' ? getEnv() : process.env;
      const botToken = env?.TELEGRAM_BOT_TOKEN;
      const allowedChatId = env?.TELEGRAM_ALLOWED_CHAT_ID;

      if (!botToken) {
        return json({ error: 'TELEGRAM_BOT_TOKEN no configurado.' }, { status: 500 });
      }

      // Check chat authorization
      if (!isChatAuthorized(chatId, allowedChatId)) {
        try {
          await sendTelegramMessage({
            fetchImpl,
            botToken,
            chatId,
            text: '⚠️ Este bot está configurado para responder exclusivamente en la comunidad oficial de CalcuFlow: https://t.me/CalcuFlow',
            replyToMessageId: messageId,
            timeoutMs
          });
        } catch {
          // Ignore network errors when notifying unauthorized chats
        }
        return json({ ok: true, status: 'unauthorized_chat' });
      }

      // Parse incoming text
      const parsed = parseTelegramMessage(text);
      if (parsed.type === 'unknown') {
        return json({ ok: true, status: 'ignored_unknown_message' });
      }

      if (parsed.type === 'help') {
        const helpText = formatHelpMessage();
        await sendTelegramMessage({
          fetchImpl,
          botToken,
          chatId,
          text: helpText,
          replyToMessageId: messageId,
          replyMarkup: buildQuickAmountsInlineKeyboard(),
          timeoutMs
        });
        return json({ ok: true, status: 'help_sent' });
      }

      if (parsed.type === 'invalid_calc') {
        const errorText = formatErrorMessage(parsed.error);
        await sendTelegramMessage({
          fetchImpl,
          botToken,
          chatId,
          text: errorText,
          replyToMessageId: messageId,
          replyMarkup: buildQuickAmountsInlineKeyboard(),
          timeoutMs
        });
        return json({ ok: true, status: 'error_sent' });
      }

      if (parsed.type === 'rates') {
        try {
          const ratesResult = await resolveServerRates({ fetchImpl, now, timeoutMs });
          if (!ratesResult.bcv?.ok || !ratesResult.p2p?.ok) {
            await sendTelegramMessage({
              fetchImpl,
              botToken,
              chatId,
              text: formatErrorMessage('No se pudieron consultar las tasas en este momento. Intenta de nuevo en unos minutos.'),
              replyToMessageId: messageId,
              replyMarkup: buildQuickAmountsInlineKeyboard(),
              timeoutMs
            });
            return json({ ok: true, status: 'rates_unavailable' });
          }

          const ratesText = formatRatesMessage({
            bcv: ratesResult.bcv.rate,
            p2p: ratesResult.p2p.rate,
            bcvDate: ratesResult.bcv.effectiveDate
          });
          await sendTelegramMessage({
            fetchImpl,
            botToken,
            chatId,
            text: ratesText,
            replyToMessageId: messageId,
            replyMarkup: buildQuickAmountsInlineKeyboard(),
            timeoutMs
          });
          return json({ ok: true, status: 'rates_sent' });
        } catch {
          await sendTelegramMessage({
            fetchImpl,
            botToken,
            chatId,
            text: formatErrorMessage('Error al consultar los proveedores de tasas.'),
            replyToMessageId: messageId,
            timeoutMs
          });
          return json({ ok: true, status: 'rates_error' });
        }
      }

      if (parsed.type === 'calc') {
        try {
          const ratesResult = await resolveServerRates({ fetchImpl, now, timeoutMs });
          if (!ratesResult.bcv?.ok || !ratesResult.p2p?.ok) {
            await sendTelegramMessage({
              fetchImpl,
              botToken,
              chatId,
              text: formatErrorMessage('No se pudieron obtener las tasas actuales para calcular. Intenta de nuevo en unos minutos.'),
              replyToMessageId: messageId,
              timeoutMs
            });
            return json({ ok: true, status: 'rates_unavailable' });
          }

          const bank = resolveBank(parsed.bankQuery);
          const calcResult = calculateValues({
            requestedUsd: parsed.amount,
            bcvRate: ratesResult.bcv.rate,
            bankMargin: 0,
            p2pRate: ratesResult.p2p.rate,
            cardFee: bank.fee,
            bpayFee: DEFAULT_BPAY_FEE
          });

          if (!calcResult) {
            await sendTelegramMessage({
              fetchImpl,
              botToken,
              chatId,
              text: formatErrorMessage('No se pudo calcular la operación con los valores proporcionados.'),
              replyToMessageId: messageId,
              timeoutMs
            });
            return json({ ok: true, status: 'calc_failed' });
          }

          const responseText = formatCalculationResult(calcResult, bank);
          const replyMarkup = buildBankInlineKeyboard(parsed.amount, bank.id);
          await sendTelegramMessage({
            fetchImpl,
            botToken,
            chatId,
            text: responseText,
            replyToMessageId: messageId,
            replyMarkup,
            timeoutMs
          });
          return json({ ok: true, status: 'calc_sent' });
        } catch {
          await sendTelegramMessage({
            fetchImpl,
            botToken,
            chatId,
            text: formatErrorMessage('Error interno al procesar el cálculo.'),
            replyToMessageId: messageId,
            timeoutMs
          });
          return json({ ok: true, status: 'calc_error' });
        }
      }

      return json({ ok: true, status: 'unhandled' });
    }
  };
}

export default createTelegramHandler();

