import { resolveServerRates } from './rate-providers.mjs';
import { calculateValues, DEFAULT_BPAY_FEE } from '../js/calculator.js';
import {
  formatErrorMessage,
  formatHelpMessage,
  formatRatesMessage,
  formatThreadIdMessage,
  isValidBankSlug,
  parseTelegramMessage,
  resolveBank
} from './telegram-formatter.mjs';
import {
  buildAmountMenuInlineKeyboard,
  buildBankMenuInlineKeyboard,
  buildCustomAmountPanelKeyboard,
  buildGroupRedirectInlineKeyboard,
  buildHomeInlineKeyboard,
  buildPaymentSupportInlineKeyboard,
  buildPrivateAccessInlineKeyboard,
  buildPrivateSupportInlineKeyboard,
  buildRatesInlineKeyboard,
  buildResultInlineKeyboard,
  buildSupportInlineKeyboard,
  buildSupportPayload,
  buildTermsInlineKeyboard,
  buildThanksInlineKeyboard,
  formatAmountSelectionMessage,
  formatAppCalculationResult,
  formatBankSelectionMessage,
  formatCustomAmountPanel,
  formatCustomAmountPrompt,
  formatCustomSupportPrompt,
  formatGroupRedirectMessage,
  formatHomeMessage,
  formatPrivateAccessMessage,
  formatPrivateSupportMessage,
  formatPaymentSupportMessage,
  formatPaymentThanksMessage,
  formatSupportMessage,
  formatTermsMessage,
  isCustomAmountPrompt,
  parseAppCallbackData,
  parseCustomAmountReply,
  parseCustomSupportReply,
  parseSupportPayload
} from './telegram-ui.mjs';

const NO_STORE = 'private, no-store';
export const TELEGRAM_BANK_MARGIN = 0.5;

function json(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': NO_STORE
    }
  });
}

export const OFFICIAL_COMMUNITY_CHAT_ID = '-1003824051698';
export const OFFICIAL_BOTS_THREAD_ID = '555';

function splitSetting(setting) {
  if (typeof setting !== 'string') return [];
  return setting.split(',').map(value => value.trim()).filter(Boolean);
}

export function isOfficialGroupChat(chatId, env = {}) {
  const idStr = String(chatId ?? '').trim();
  if (!idStr) return false;
  if (idStr === OFFICIAL_COMMUNITY_CHAT_ID) return true;
  const officialIds = splitSetting(env.TELEGRAM_ALLOWED_CHAT_ID);
  return officialIds.includes(idStr);
}

export function getConfiguredThreadId(chatId, env = {}) {
  const idStr = String(chatId ?? '').trim();
  const mappingSetting = String(env.TELEGRAM_ALLOWED_THREADS || '').trim();
  if (mappingSetting) {
    for (const entry of splitSetting(mappingSetting)) {
      const match = entry.match(/^(-?\d+):(\d+)$/);
      if (match && match[1] === idStr) return match[2];
    }
    if (idStr === OFFICIAL_COMMUNITY_CHAT_ID) return OFFICIAL_BOTS_THREAD_ID;
    return '';
  }
  const envThread = String(env.TELEGRAM_ALLOWED_THREAD_ID || '').trim();
  if (envThread) return envThread;
  if (idStr === OFFICIAL_COMMUNITY_CHAT_ID) return OFFICIAL_BOTS_THREAD_ID;
  return '';
}

function inferChatType(chat) {
  if (typeof chat?.type === 'string') return chat.type;
  return Number(chat?.id) > 0 ? 'private' : 'supergroup';
}

export function getTelegramAccessContext(chat, messageThreadId, env = {}) {
  const chatType = inferChatType(chat);
  const isPrivate = chatType === 'private';
  if (isPrivate) {
    return {
      allowed: true,
      isPrivate: true,
      isOfficialGroup: false,
      isAllowedThread: true,
      chatId: String(chat?.id ?? ''),
      messageThreadId: null,
      allowedThreadId: ''
    };
  }

  const isGroup = chatType === 'group' || chatType === 'supergroup';
  if (!isGroup) {
    return {
      allowed: false,
      isPrivate: false,
      isOfficialGroup: false,
      isAllowedThread: false,
      chatId: String(chat?.id ?? ''),
      messageThreadId: messageThreadId !== undefined && messageThreadId !== null ? String(messageThreadId) : null,
      allowedThreadId: ''
    };
  }

  const chatIdStr = String(chat?.id ?? '').trim();
  const isOfficial = isOfficialGroupChat(chatIdStr, env);
  if (!isOfficial) {
    return {
      allowed: false,
      isPrivate: false,
      isOfficialGroup: false,
      isAllowedThread: false,
      chatId: chatIdStr,
      messageThreadId: messageThreadId !== undefined && messageThreadId !== null ? String(messageThreadId) : null,
      allowedThreadId: ''
    };
  }

  const allowedThreadId = getConfiguredThreadId(chatIdStr, env);
  const currentThreadStr = messageThreadId !== undefined && messageThreadId !== null
    ? String(messageThreadId).trim()
    : '';

  // In the confirmed official group (-1003824051698), message_thread_id MUST match 555 (or configured thread).
  // In any other official group where allowedThreadId is configured, it must match.
  // If an unmapped secondary group has no allowedThreadId, it is allowed.
  const isAllowedThread = Boolean(allowedThreadId)
    ? currentThreadStr === allowedThreadId
    : (chatIdStr === OFFICIAL_COMMUNITY_CHAT_ID ? currentThreadStr === OFFICIAL_BOTS_THREAD_ID : true);

  return {
    allowed: isAllowedThread,
    isPrivate: false,
    isOfficialGroup: true,
    isAllowedThread,
    chatId: chatIdStr,
    messageThreadId: currentThreadStr || null,
    allowedThreadId: allowedThreadId || (chatIdStr === OFFICIAL_COMMUNITY_CHAT_ID ? OFFICIAL_BOTS_THREAD_ID : '')
  };
}

function parseEnhancedMessage(text) {
  if (typeof text !== 'string') return { type: 'unknown' };
  const trimmed = text.trim();
  const match = trimmed.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s+(.*))?$/s);
  if (match) {
    const command = match[1].toLowerCase();
    const args = match[2]?.trim().toLowerCase() || '';
    if (command === 'start') {
      if (args === 'support') return { type: 'support' };
      if (args === 'calc') return { type: 'show_banks' };
      return { type: 'home' };
    }
    if (command === 'apoyar') return { type: 'support' };
    if (command === 'terms' || command === 'terminos') return { type: 'terms' };
    if (command === 'paysupport') return { type: 'payment_support' };
    if (command === 'threadid' || command === 'topicid') return { type: 'thread_id' };
    if (command === 'bancos') return { type: 'show_banks' };
    if (command === 'privado') return { type: 'private_access' };
    if ((command === 'calc' || command === 'calcular' || command === 'c') && !args) {
      return { type: 'show_banks' };
    }
  }
  return parseTelegramMessage(text);
}

function isExplicitGroupInvocation(message, parsed) {
  if (parsed.type === 'unknown') return false;
  const text = String(message?.text || '').trim();
  return text.startsWith('/') || Boolean(message?.reply_to_message?.from?.is_bot);
}

function formatUpdatedAt(date) {
  try {
    return date.toLocaleString('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

export function validatePreCheckoutQuery(query) {
  const support = parseSupportPayload(query?.invoice_payload);
  if (!support) return { ok: false, reason: 'Este apoyo no es válido.' };
  if (query?.currency !== 'XTR') return { ok: false, reason: 'La moneda del apoyo no es válida.' };
  if (query?.total_amount !== support.amount) return { ok: false, reason: 'El monto del apoyo no coincide.' };
  return { ok: true, ...support };
}

export function validateSuccessfulPayment(payment) {
  const support = parseSupportPayload(payment?.invoice_payload);
  return Boolean(
    support &&
    payment?.currency === 'XTR' &&
    payment?.total_amount === support.amount
  );
}

export function createTelegramAppHandler({
  fetchImpl = globalThis.fetch,
  getEnv = () => process.env,
  now = () => new Date(),
  timeoutMs,
  api
} = {}) {
  if (!api) throw new Error('Telegram API helpers are required');

  const useTestApi = () => {
    const env = typeof getEnv === 'function' ? getEnv() : process.env;
    return /^(1|true|yes)$/i.test(String(env?.TELEGRAM_BOT_API_TEST_MODE || '').trim());
  };

  async function safeSend(options) {
    try {
      await api.sendTelegramMessage({ fetchImpl, timeoutMs, testMode: useTestApi(), ...options });
      return true;
    } catch {
      return false;
    }
  }

  async function safeEdit(options) {
    try {
      await api.editTelegramMessageText({ fetchImpl, timeoutMs, testMode: useTestApi(), ...options });
      return true;
    } catch {
      return false;
    }
  }

  async function safeAnswerCallback(options) {
    try {
      await api.answerTelegramCallbackQuery({ fetchImpl, timeoutMs, testMode: useTestApi(), ...options });
    } catch {
      // Telegram will eventually clear the client spinner; webhook processing continues.
    }
  }

  async function sendRedirect({ botToken, env, chat, messageThreadId, fromUserId, replyToMessageId, callbackQueryId }) {
    const replyMarkup = buildGroupRedirectInlineKeyboard({
      chatId: chat?.id,
      threadId: getConfiguredThreadId(chat?.id, env),
      botUsername: env.TELEGRAM_BOT_USERNAME
    });
    const baseOptions = {
      botToken,
      chatId: chat?.id,
      text: formatGroupRedirectMessage(),
      replyMarkup,
      messageThreadId
    };
    if (fromUserId) {
      const ephemeralSent = await safeSend({
        ...baseOptions,
        ephemeralMessageParameters: {
          receiver_user_id: fromUserId,
          ...(callbackQueryId ? {
            callback_query_id: callbackQueryId,
            replace_callback_query_message: true
          } : {})
        }
      });
      if (ephemeralSent) return 'ephemeral_redirect';
    }
    await safeSend({ ...baseOptions, replyToMessageId });
    return 'redirect_sent';
  }

  async function sendPrivateAccess({ botToken, env, chat, messageThreadId, fromUserId, replyToMessageId }) {
    const baseOptions = {
      botToken,
      chatId: chat?.id,
      text: formatPrivateAccessMessage(),
      replyMarkup: buildPrivateAccessInlineKeyboard(env.TELEGRAM_BOT_USERNAME),
      messageThreadId
    };
    if (fromUserId) {
      const ephemeralSent = await safeSend({
        ...baseOptions,
        ephemeralMessageParameters: { receiver_user_id: fromUserId }
      });
      if (ephemeralSent) return 'ephemeral_private_access';
    }
    await safeSend({ ...baseOptions, replyToMessageId });
    return 'private_access_sent';
  }

  async function sendPrivateSupport({ botToken, env, chat, messageThreadId, fromUserId, replyToMessageId, callbackQueryId }) {
    const baseOptions = {
      botToken,
      chatId: chat?.id,
      text: formatPrivateSupportMessage(),
      replyMarkup: buildPrivateSupportInlineKeyboard(env.TELEGRAM_BOT_USERNAME),
      messageThreadId
    };
    if (fromUserId) {
      const ephemeralSent = await safeSend({
        ...baseOptions,
        ephemeralMessageParameters: {
          receiver_user_id: fromUserId,
          ...(callbackQueryId ? {
            callback_query_id: callbackQueryId,
            replace_callback_query_message: true
          } : {})
        }
      });
      if (ephemeralSent) return 'ephemeral_support_redirect';
    }
    await safeSend({ ...baseOptions, replyToMessageId });
    return 'support_redirect_sent';
  }

  async function loadRates() {
    const rates = await resolveServerRates({ fetchImpl, now, timeoutMs });
    return rates?.bcv?.ok && rates?.p2p?.ok ? rates : null;
  }

  async function calculate(amount, bankId, ownerId = null) {
    const rates = await loadRates();
    if (!rates) return { ok: false, error: 'No se pudieron obtener las tasas actuales para calcular. Intenta de nuevo en unos minutos.' };
    const bank = resolveBank(bankId);
    const result = calculateValues({
      requestedUsd: amount,
      bcvRate: rates.bcv.rate,
      bankMargin: TELEGRAM_BANK_MARGIN,
      p2pRate: rates.p2p.rate,
      cardFee: bank.fee,
      bpayFee: DEFAULT_BPAY_FEE
    });
    if (!result) return { ok: false, error: 'No se pudo calcular la operación con los valores proporcionados.' };
    return {
      ok: true,
      bank,
      text: formatAppCalculationResult(result, bank, {
        updatedAt: formatUpdatedAt(now()),
        bankMargin: TELEGRAM_BANK_MARGIN
      }),
      replyMarkup: buildResultInlineKeyboard(bank.id, ownerId)
    };
  }

  function paymentSupportView(env, ownerId) {
    const replyMarkup = buildPaymentSupportInlineKeyboard({
      paymentSupportUrl: env.TELEGRAM_PAYMENT_SUPPORT_URL,
      ownerId
    });
    const contactConfigured = Boolean(replyMarkup.inline_keyboard[0]?.[0]?.url);
    return {
      text: formatPaymentSupportMessage({ contactConfigured }),
      replyMarkup
    };
  }

  async function sendSupportInvoice({ botToken, chatId, amount, custom = false }) {
    const payload = buildSupportPayload(amount, { custom });
    if (!payload) throw new Error('Invalid support amount');
    await api.sendTelegramInvoice({
      fetchImpl,
      botToken,
      chatId,
      title: 'Apoyo a CalcuFlow',
      description: 'Apoyo voluntario para el mantenimiento y desarrollo de CalcuFlow.',
      payload,
      amount,
      testMode: useTestApi(),
      timeoutMs
    });
  }

  async function handlePreCheckout(update, botToken) {
    const query = update.pre_checkout_query;
    const validation = validatePreCheckoutQuery(query);
    try {
      await api.answerTelegramPreCheckoutQuery({
        fetchImpl,
        botToken,
        preCheckoutQueryId: query.id,
        ok: validation.ok,
        errorMessage: validation.ok ? null : validation.reason,
        testMode: useTestApi(),
        timeoutMs
      });
    } catch {
      return json({ ok: true, status: 'pre_checkout_answer_failed' });
    }
    return json({ ok: true, status: validation.ok ? 'pre_checkout_approved' : 'pre_checkout_rejected' });
  }

  async function handleCallback(callbackQuery, env, botToken) {
    const chat = callbackQuery.message?.chat;
    const chatId = chat?.id || callbackQuery.from?.id;
    const messageId = callbackQuery.message?.message_id;
    const messageThreadId = callbackQuery.message?.message_thread_id;
    const access = getTelegramAccessContext(chat || { id: chatId }, messageThreadId, env);
    const parsed = parseAppCallbackData(callbackQuery.data);

    if (!access.allowed) {
      await safeAnswerCallback({
        botToken,
        callbackQueryId: callbackQuery.id,
        text: access.isOfficialGroup ? 'Usa el tema Bots para interactuar con CalcuFlow.' : undefined,
        showAlert: false
      });
      return json({ ok: true, status: 'ephemeral_redirect' });
    }

    const callbackUserId = String(callbackQuery.from?.id ?? '').trim();
    const callbackOwnerId = String(parsed.ownerId ?? '').trim();
    const isWrongOwner = Boolean(callbackOwnerId) && callbackOwnerId !== callbackUserId;
    const isUnownedGroupPanel = !access.isPrivate && !callbackOwnerId;
    if (isWrongOwner || isUnownedGroupPanel) {
      await safeAnswerCallback({
        botToken,
        callbackQueryId: callbackQuery.id,
        text: 'Este cálculo pertenece a otro usuario. Usa /calc para abrir el tuyo.',
        showAlert: true
      });
      return json({ ok: true, status: 'wrong_callback_owner' });
    }

    const ownerId = callbackOwnerId || callbackUserId || null;
    await safeAnswerCallback({ botToken, callbackQueryId: callbackQuery.id });
    if (!chatId || !messageId) return json({ ok: true, status: 'ignored_inline_callback' });

    const edit = (text, replyMarkup) => safeEdit({ botToken, chatId, messageId, text, replyMarkup });
    if (parsed.type === 'home') {
      await edit(formatHomeMessage(), buildHomeInlineKeyboard({ isPrivate: access.isPrivate, botUsername: env.TELEGRAM_BOT_USERNAME, ownerId }));
      return json({ ok: true, status: 'home_sent' });
    }
    if (parsed.type === 'show_banks') {
      await edit(formatBankSelectionMessage(), buildBankMenuInlineKeyboard(ownerId));
      return json({ ok: true, status: 'banks_sent' });
    }
    if (parsed.type === 'select_bank') {
      const bank = resolveBank(parsed.bankId);
      await edit(formatAmountSelectionMessage(bank), buildAmountMenuInlineKeyboard(bank.id, ownerId));
      return json({ ok: true, status: 'amounts_sent' });
    }
    if (parsed.type === 'custom_amount') {
      const bank = resolveBank(parsed.bankId);
      await edit(formatCustomAmountPanel(bank), buildCustomAmountPanelKeyboard(bank.id, ownerId));
      await safeSend({
        botToken,
        chatId,
        text: formatCustomAmountPrompt(bank.id, messageId, ownerId),
        replyToMessageId: callbackQuery.message?.reply_to_message?.message_id,
        messageThreadId,
        replyMarkup: {
          force_reply: true,
          input_field_placeholder: 'Ejemplo: 375',
          selective: true
        }
      });
      return json({ ok: true, status: 'custom_amount_prompt_sent' });
    }
    if (parsed.type === 'rates') {
      try {
        const rates = await loadRates();
        if (!rates) {
          await edit(formatErrorMessage('No se pudieron consultar las tasas en este momento. Intenta de nuevo en unos minutos.'), buildRatesInlineKeyboard(ownerId));
          return json({ ok: true, status: 'rates_unavailable' });
        }
        await edit(formatRatesMessage({ bcv: rates.bcv.rate, p2p: rates.p2p.rate, bcvDate: rates.bcv.effectiveDate }), buildRatesInlineKeyboard(ownerId));
        return json({ ok: true, status: 'rates_sent' });
      } catch {
        await edit(formatErrorMessage('Error al consultar los proveedores de tasas.'), buildRatesInlineKeyboard(ownerId));
        return json({ ok: true, status: 'rates_error' });
      }
    }
    if (parsed.type === 'calc') {
      try {
        const calculation = await calculate(parsed.amount, parsed.bankId, ownerId);
        await edit(calculation.ok ? calculation.text : formatErrorMessage(calculation.error), calculation.ok ? calculation.replyMarkup : buildAmountMenuInlineKeyboard(parsed.bankId, ownerId));
        return json({ ok: true, status: calculation.ok ? 'calc_sent' : 'calc_failed' });
      } catch {
        await edit(formatErrorMessage('Error interno al procesar el cálculo.'), buildAmountMenuInlineKeyboard(parsed.bankId, ownerId));
        return json({ ok: true, status: 'calc_error' });
      }
    }
    if (parsed.type === 'support') {
      if (!access.isPrivate) {
        const status = await sendPrivateSupport({ botToken, env, chat, messageThreadId, fromUserId: callbackQuery.from?.id, callbackQueryId: callbackQuery.id });
        return json({ ok: true, status });
      }
      await edit(formatSupportMessage(), buildSupportInlineKeyboard(ownerId));
      return json({ ok: true, status: 'support_sent' });
    }
    if (parsed.type === 'terms') {
      await edit(formatTermsMessage(), buildTermsInlineKeyboard(ownerId));
      return json({ ok: true, status: 'terms_sent' });
    }
    if (parsed.type === 'payment_support') {
      const view = paymentSupportView(env, ownerId);
      await edit(view.text, view.replyMarkup);
      return json({ ok: true, status: 'payment_support_sent' });
    }
    if (parsed.type === 'custom_support_amount') {
      if (!access.isPrivate) {
        const status = await sendPrivateSupport({ botToken, env, chat, messageThreadId, fromUserId: callbackQuery.from?.id, callbackQueryId: callbackQuery.id });
        return json({ ok: true, status });
      }
      await safeSend({
        botToken,
        chatId,
        text: formatCustomSupportPrompt(ownerId),
        replyMarkup: {
          force_reply: true,
          input_field_placeholder: 'Ejemplo: 750',
          selective: true
        }
      });
      return json({ ok: true, status: 'custom_support_prompt_sent' });
    }
    if (parsed.type === 'support_invoice') {
      if (!access.isPrivate) {
        const status = await sendPrivateSupport({ botToken, env, chat, messageThreadId, fromUserId: callbackQuery.from?.id, callbackQueryId: callbackQuery.id });
        return json({ ok: true, status });
      }
      try {
        await sendSupportInvoice({ botToken, chatId, amount: parsed.amount });
        return json({ ok: true, status: 'invoice_sent' });
      } catch {
        await safeAnswerCallback({ botToken, callbackQueryId: callbackQuery.id, text: 'No se pudo abrir el pago. Intenta de nuevo.', showAlert: true });
        return json({ ok: true, status: 'invoice_error' });
      }
    }
    if (parsed.type === 'invalid_support') {
      await safeAnswerCallback({ botToken, callbackQueryId: callbackQuery.id, text: 'Monto de apoyo no válido.', showAlert: true });
      return json({ ok: true, status: 'invalid_support_amount' });
    }
    return json({ ok: true, status: 'ignored_unknown_callback' });
  }

  async function handleCustomReply(message, customReply, env, botToken, access) {
    const chatId = message.chat.id;
    const messageThreadId = message.message_thread_id;
    const ownerId = customReply.ownerId || message.from?.id || null;
    if (!customReply.ok) {
      await safeSend({
        botToken,
        chatId,
        text: `${formatErrorMessage(customReply.error)}\n\n${formatCustomAmountPrompt(customReply.bankId, customReply.panelMessageId, ownerId)}`,
        replyToMessageId: message.message_id,
        messageThreadId,
        replyMarkup: {
          force_reply: true,
          input_field_placeholder: 'Ejemplo: 375',
          selective: true
        }
      });
      return json({ ok: true, status: 'custom_amount_invalid' });
    }

    try {
      const calculation = await calculate(customReply.amount, customReply.bankId, ownerId);
      const edited = await safeEdit({
        botToken,
        chatId,
        messageId: customReply.panelMessageId,
        text: calculation.ok ? calculation.text : formatErrorMessage(calculation.error),
        replyMarkup: calculation.ok ? calculation.replyMarkup : buildAmountMenuInlineKeyboard(customReply.bankId, ownerId)
      });
      if (calculation.ok && edited && !access.isPrivate && access.isOfficialGroup && access.isAllowedThread) {
        for (const messageId of [message.message_id, customReply.promptMessageId]) {
          try {
            await api.deleteTelegramMessage({ fetchImpl, botToken, chatId, messageId, timeoutMs, testMode: useTestApi() });
          } catch {
            // Cleanup is best-effort and must never break the calculation.
          }
        }
      }
      return json({ ok: true, status: calculation.ok ? 'custom_calc_sent' : 'calc_failed' });
    } catch {
      await safeSend({ botToken, chatId, text: formatErrorMessage('Error interno al procesar el cálculo.'), replyToMessageId: message.message_id, messageThreadId });
      return json({ ok: true, status: 'calc_error' });
    }
  }

  async function handleCustomSupportReply(message, customReply, botToken, access) {
    if (!access.isPrivate) return json({ ok: true, status: 'ignored_custom_support_outside_private' });
    const replyUserId = String(message.from?.id ?? '').trim();
    const promptOwnerId = String(customReply.ownerId ?? '').trim();
    if (promptOwnerId && promptOwnerId !== replyUserId) {
      return json({ ok: true, status: 'ignored_custom_support_wrong_user' });
    }

    const common = { botToken, chatId: message.chat.id, replyToMessageId: message.message_id };
    if (!customReply.ok) {
      await safeSend({
        ...common,
        text: `${formatErrorMessage(customReply.error)}\n\n${formatCustomSupportPrompt(promptOwnerId || replyUserId)}`,
        replyMarkup: {
          force_reply: true,
          input_field_placeholder: 'Ejemplo: 750',
          selective: true
        }
      });
      return json({ ok: true, status: 'custom_support_invalid' });
    }

    try {
      await sendSupportInvoice({
        botToken,
        chatId: message.chat.id,
        amount: customReply.amount,
        custom: true
      });
      return json({ ok: true, status: 'custom_support_invoice_sent' });
    } catch {
      await safeSend({ ...common, text: formatErrorMessage('No se pudo abrir el pago. Intenta de nuevo.') });
      return json({ ok: true, status: 'invoice_error' });
    }
  }

  async function handleMessage(message, env, botToken) {
    const chat = message.chat;
    const chatId = chat?.id;
    const messageThreadId = message.message_thread_id;
    if (!chatId) return json({ ok: true, status: 'ignored_no_chat' });

    // CENTRAL AUTHORIZATION & ROUTING GUARD
    const access = getTelegramAccessContext(chat, messageThreadId, env);
    const rawText = typeof message.text === 'string' ? message.text.trim() : '';

    // Diagnostics: /threadid works in forum topics, general, and private
    if (/^\/(?:threadid|topicid)(?:@\w+)?(?:\s+.*)?$/i.test(rawText)) {
      await safeSend({
        botToken,
        chatId,
        text: formatThreadIdMessage(chatId, messageThreadId),
        replyToMessageId: message.message_id,
        messageThreadId
      });
      return json({ ok: true, status: 'thread_id_sent' });
    }

    // Guard: Block all normal bot functionality outside allowed context
    if (!access.allowed) {
      if (rawText.startsWith('/')) {
        const parsed = parseEnhancedMessage(rawText);
        if (parsed.type !== 'unknown') {
          const status = await sendRedirect({
            botToken,
            env,
            chat,
            messageThreadId,
            fromUserId: message.from?.id,
            replyToMessageId: message.message_id
          });
          return json({ ok: true, status });
        }
      }
      // Ordinary messages (200, 375, 500 bdv, text, replies to old prompts) are ignored without bot response
      return json({
        ok: true,
        status: access.isOfficialGroup ? 'ignored_general_message' : 'ignored_external_group_message'
      });
    }

    // Inside allowed context:
    const payment = message.successful_payment;
    if (payment) {
      if (!access.isPrivate || !validateSuccessfulPayment(payment)) {
        return json({ ok: true, status: 'ignored_invalid_payment' });
      }
      await safeSend({
        botToken,
        chatId,
        text: formatPaymentThanksMessage(),
        replyMarkup: buildThanksInlineKeyboard(message.from?.id)
      });
      return json({ ok: true, status: 'payment_thanks_sent' });
    }

    // Custom amount ForceReply safety
    const isCustomPrompt = isCustomAmountPrompt(message);
    if (isCustomPrompt) {
      const customReply = parseCustomAmountReply(message);
      if (!customReply) {
        return json({ ok: true, status: 'ignored_custom_reply_malformed_reference' });
      }

      if (!access.isPrivate) {
        const promptChatId = String(message.reply_to_message?.chat?.id || '');
        if (promptChatId && promptChatId !== String(chatId)) {
          return json({ ok: true, status: 'ignored_custom_reply_invalid_context' });
        }
        const promptThreadId = message.reply_to_message?.message_thread_id !== undefined && message.reply_to_message?.message_thread_id !== null
          ? String(message.reply_to_message.message_thread_id)
          : '';
        if (promptThreadId && promptThreadId !== String(messageThreadId || '')) {
          return json({ ok: true, status: 'ignored_custom_reply_invalid_context' });
        }
      }

      const replyUserId = String(message.from?.id ?? '').trim();
      const promptOwnerId = String(customReply.ownerId ?? '').trim();
      if ((promptOwnerId && promptOwnerId !== replyUserId) || (!access.isPrivate && !promptOwnerId)) {
        return json({ ok: true, status: 'ignored_custom_reply_wrong_user' });
      }

      if (!isValidBankSlug(customReply.bankId)) {
        return json({ ok: true, status: 'ignored_custom_reply_invalid_bank' });
      }

      return handleCustomReply(message, customReply, env, botToken, access);
    }

    const customSupportReply = parseCustomSupportReply(message);
    if (customSupportReply) {
      return handleCustomSupportReply(message, customSupportReply, botToken, access);
    }

    if (typeof message.text !== 'string') return json({ ok: true, status: 'ignored_no_text' });
    const parsed = parseEnhancedMessage(message.text);

    if (parsed.type === 'unknown') return json({ ok: true, status: 'ignored_unknown_message' });
    const ownerId = message.from?.id || null;
    const common = { botToken, chatId, replyToMessageId: message.message_id, messageThreadId };

    const cleanupCommandMessage = async () => {
      if (!access.isPrivate && access.isOfficialGroup && access.isAllowedThread && String(message.text || '').trim().startsWith('/')) {
        try {
          await api.deleteTelegramMessage({ fetchImpl, botToken, chatId, messageId: message.message_id, timeoutMs, testMode: useTestApi() });
        } catch {
          // Cleanup is best-effort and must never break functionality.
        }
      }
    };

    if (parsed.type === 'home') {
      await safeSend({ ...common, text: formatHomeMessage(), replyMarkup: buildHomeInlineKeyboard({ isPrivate: access.isPrivate, botUsername: env.TELEGRAM_BOT_USERNAME, ownerId }) });
      await cleanupCommandMessage();
      return json({ ok: true, status: 'home_sent' });
    }
    if (parsed.type === 'help') {
      await safeSend({ ...common, text: formatHelpMessage(), replyMarkup: buildHomeInlineKeyboard({ isPrivate: access.isPrivate, botUsername: env.TELEGRAM_BOT_USERNAME, ownerId }) });
      await cleanupCommandMessage();
      return json({ ok: true, status: 'help_sent' });
    }
    if (parsed.type === 'show_banks') {
      await safeSend({ ...common, text: formatBankSelectionMessage(), replyMarkup: buildBankMenuInlineKeyboard(ownerId) });
      await cleanupCommandMessage();
      return json({ ok: true, status: 'banks_sent' });
    }
    if (parsed.type === 'private_access') {
      if (access.isPrivate) {
        await safeSend({ ...common, text: formatHomeMessage(), replyMarkup: buildHomeInlineKeyboard({ isPrivate: true, botUsername: env.TELEGRAM_BOT_USERNAME, ownerId }) });
        return json({ ok: true, status: 'home_sent' });
      }
      const status = await sendPrivateAccess({
        botToken,
        env,
        chat,
        messageThreadId,
        fromUserId: message.from?.id,
        replyToMessageId: message.message_id
      });
      await cleanupCommandMessage();
      return json({ ok: true, status });
    }
    if (parsed.type === 'support') {
      if (!access.isPrivate) {
        const status = await sendPrivateSupport({ botToken, env, chat, messageThreadId, fromUserId: message.from?.id, replyToMessageId: message.message_id });
        await cleanupCommandMessage();
        return json({ ok: true, status });
      }
      await safeSend({ ...common, text: formatSupportMessage(), replyMarkup: buildSupportInlineKeyboard(ownerId) });
      return json({ ok: true, status: 'support_sent' });
    }
    if (parsed.type === 'terms') {
      await safeSend({ ...common, text: formatTermsMessage(), replyMarkup: buildTermsInlineKeyboard(ownerId) });
      await cleanupCommandMessage();
      return json({ ok: true, status: 'terms_sent' });
    }
    if (parsed.type === 'payment_support') {
      const view = paymentSupportView(env, ownerId);
      await safeSend({ ...common, text: view.text, replyMarkup: view.replyMarkup });
      await cleanupCommandMessage();
      return json({ ok: true, status: 'payment_support_sent' });
    }
    if (parsed.type === 'invalid_calc') {
      await safeSend({ ...common, text: formatErrorMessage(parsed.error), replyMarkup: buildBankMenuInlineKeyboard(ownerId) });
      return json({ ok: true, status: 'error_sent' });
    }
    if (parsed.type === 'rates') {
      try {
        const rates = await loadRates();
        const text = rates
          ? formatRatesMessage({ bcv: rates.bcv.rate, p2p: rates.p2p.rate, bcvDate: rates.bcv.effectiveDate })
          : formatErrorMessage('No se pudieron consultar las tasas en este momento. Intenta de nuevo en unos minutos.');
        await safeSend({ ...common, text, replyMarkup: buildRatesInlineKeyboard(ownerId) });
        await cleanupCommandMessage();
        return json({ ok: true, status: rates ? 'rates_sent' : 'rates_unavailable' });
      } catch {
        await safeSend({ ...common, text: formatErrorMessage('Error al consultar los proveedores de tasas.'), replyMarkup: buildRatesInlineKeyboard(ownerId) });
        return json({ ok: true, status: 'rates_error' });
      }
    }
    if (parsed.type === 'calc') {
      try {
        const bank = resolveBank(parsed.bankQuery);
        const calculation = await calculate(parsed.amount, bank.id === 'custom' ? parsed.bankQuery : bank.id, ownerId);
        await safeSend({
          ...common,
          text: calculation.ok ? calculation.text : formatErrorMessage(calculation.error),
          replyMarkup: calculation.ok ? calculation.replyMarkup : buildBankMenuInlineKeyboard(ownerId)
        });
        return json({ ok: true, status: calculation.ok ? 'calc_sent' : 'calc_failed' });
      } catch {
        await safeSend({ ...common, text: formatErrorMessage('Error interno al procesar el cálculo.') });
        return json({ ok: true, status: 'calc_error' });
      }
    }
    return json({ ok: true, status: 'unhandled' });
  }

  return {
    async fetch(request) {
      if (request.method === 'GET') return json({ ok: true, service: 'calcuflow-telegram-webhook' });
      if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, { status: 405 });

      let update;
      try {
        update = await request.json();
      } catch {
        return json({ error: 'JSON no válido.' }, { status: 400 });
      }

      const env = typeof getEnv === 'function' ? getEnv() : process.env;
      const botToken = env?.TELEGRAM_BOT_TOKEN;
      if (!botToken) return json({ error: 'TELEGRAM_BOT_TOKEN no configurado.' }, { status: 500 });

      if (update?.pre_checkout_query) return handlePreCheckout(update, botToken);
      if (update?.callback_query) return handleCallback(update.callback_query, env, botToken);
      const message = update?.message || update?.edited_message;
      if (!message || typeof message !== 'object') return json({ ok: true, status: 'ignored_no_message' });
      return handleMessage(message, env, botToken);
    }
  };
}
