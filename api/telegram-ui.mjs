import { money } from '../js/utils.js';
import {
  CANONICAL_APP_URL,
  formatPercent,
  resolveBank
} from './telegram-formatter.mjs';

export const SUPPORT_AMOUNTS = Object.freeze([50, 100, 250, 500]);
export const SUPPORT_PAYLOAD_PREFIX = 'calcuflow_support:v2:';
export const MIN_SUPPORT_AMOUNT = 10;
export const MAX_SUPPORT_AMOUNT = 5000;
export const CUSTOM_AMOUNT_PROMPT_PREFIX = 'CF-MONTO';
export const CUSTOM_SUPPORT_PROMPT_PREFIX = 'CF-STARS';
const CALLBACK_OWNER_SEPARATOR = '|u:';

export const MENU_BANKS = Object.freeze([
  Object.freeze({ id: 'bdv-fisica', label: 'Banco de Venezuela' }),
  Object.freeze({ id: 'bbva-provincial', label: 'BBVA Provincial' }),
  Object.freeze({ id: 'banesco-fisica', label: 'Banesco' }),
  Object.freeze({ id: 'bnc', label: 'BNC' }),
  Object.freeze({ id: 'bancamiga', label: 'Bancamiga' }),
  Object.freeze({ id: 'banco-tesoro', label: 'Banco del Tesoro' }),
  Object.freeze({ id: 'bdt', label: 'BDT' })
]);

export function parseRequestedAmount(input) {
  const rawAmount = String(input ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount)) {
    return { ok: false, error: 'Ingresa un monto numérico válido (hasta 2 decimales).' };
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'El monto debe ser mayor que 0.' };
  }
  if (amount > 1_000_000) {
    return { ok: false, error: 'El máximo por cálculo es 1.000.000,00 USD.' };
  }
  return { ok: true, amount };
}

export function formatHomeMessage() {
  return '🤖 *CalcuFlow*\n\n¿Qué quieres hacer?';
}

export function formatBankSelectionMessage() {
  return '🏦 *Elige un banco:*';
}

export function formatAmountSelectionMessage(bankInfo) {
  const bank = resolveBank(bankInfo?.id || bankInfo);
  return `🏦 *${bank.name}*\nComisión: ${formatPercent(bank.fee)}\n\n¿Cuánto quieres calcular?`;
}

export function formatCustomAmountPanel(bankInfo) {
  const bank = resolveBank(bankInfo?.id || bankInfo);
  return `✏️ *Otro monto*\n\n🏦 ${bank.name} · ${formatPercent(bank.fee)}\n\nResponde al mensaje que te envié con el monto en USD.`;
}

export function formatCustomAmountPrompt(bankId, panelMessageId, ownerId = null) {
  const owner = normalizeTelegramUserId(ownerId);
  const ownerSuffix = owner ? `:${owner}` : '';
  return `✏️ *Escribe el monto en USD*\n\nEjemplo: 375\n\nReferencia: ${CUSTOM_AMOUNT_PROMPT_PREFIX}:${bankId}:${panelMessageId}${ownerSuffix}`;
}

export function parseCustomAmountReply(message) {
  const prompt = message?.reply_to_message;
  if (!prompt?.from?.is_bot || typeof prompt.text !== 'string') return null;
  const match = prompt.text.match(new RegExp(`Referencia:\\s*${CUSTOM_AMOUNT_PROMPT_PREFIX}:([a-z0-9-]+):(\\d+)(?::(\\d+))?\\s*$`, 'i'));
  if (!match) return null;
  const result = {
    bankId: match[1],
    panelMessageId: Number(match[2]),
    promptMessageId: prompt.message_id,
    ...parseRequestedAmount(message?.text)
  };
  if (match[3]) result.ownerId = match[3];
  return result;
}

export function parseSupportAmount(input) {
  const rawAmount = String(input ?? '').trim();
  if (!/^\d+$/.test(rawAmount)) {
    return { ok: false, error: 'Ingresa una cantidad válida de Stars.' };
  }
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < MIN_SUPPORT_AMOUNT || amount > MAX_SUPPORT_AMOUNT) {
    return { ok: false, error: 'Ingresa una cantidad válida de Stars.' };
  }
  return { ok: true, amount };
}

export function formatCustomSupportPrompt(ownerId) {
  const owner = normalizeTelegramUserId(ownerId);
  const ownerSuffix = owner ? `:${owner}` : '';
  return `⭐ *¿Cuántas Stars quieres aportar?*\n\nEscribe un monto entero entre ${MIN_SUPPORT_AMOUNT} y ${money(MAX_SUPPORT_AMOUNT, 0)}.\nEjemplo: 750\n\nReferencia: ${CUSTOM_SUPPORT_PROMPT_PREFIX}${ownerSuffix}`;
}

export function parseCustomSupportReply(message) {
  const prompt = message?.reply_to_message;
  if (!prompt?.from?.is_bot || typeof prompt.text !== 'string') return null;
  const match = prompt.text.match(new RegExp(`Referencia:\\s*${CUSTOM_SUPPORT_PROMPT_PREFIX}(?::(\\d+))?\\s*$`, 'i'));
  if (!match) return null;
  const result = {
    promptMessageId: prompt.message_id,
    ...parseSupportAmount(message?.text)
  };
  if (match[1]) result.ownerId = match[1];
  return result;
}

export function formatAppCalculationResult(result, bankInfo, { updatedAt = null, bankMargin = 0.5 } = {}) {
  const bank = typeof bankInfo === 'object' && bankInfo !== null ? bankInfo : resolveBank(bankInfo);
  const profitSign = result.profitUsdt >= 0 ? '+' : '';
  const roiSign = result.roi >= 0 ? '+' : '';
  const updatedLine = updatedAt ? `\n\n_Actualizado: ${updatedAt}_` : '';
  return `📊 *CalcuFlow*\n\n🏦 *${bank.name} · ${formatPercent(bank.fee)}*\nCompra: ${money(result.usdUsed, 2)} USD\n\n🇻🇪 *Bolívares necesarios*\n${money(result.vesNeeded, 2)} Bs\n\n💳 *Monto en BPay*\n${money(result.safeGateway?.bpayInputAmount ?? result.afterCard, 2)} USD\n\n🟢 *USDT finales*\n${money(result.usdtFinal, 2)} USDT\n\n💰 *Ganancia estimada*\n${profitSign}${money(result.profitUsdt, 2)} USD · ${roiSign}${money(result.roi, 2)}%\n\n📈 BCV: ${money(result.bcv, 2)} Bs\n🏦 Tasa banco (+${money(bankMargin, 1)}%): ${money(result.bank, 2)} Bs\n🔄 P2P: ${money(result.p2p, 2)} Bs${updatedLine}`;
}

export function formatSupportMessage() {
  return `⭐ *Apoya CalcuFlow*\n\nCalcuFlow seguirá siendo gratuito.\n\nSi te resulta útil, puedes apoyar voluntariamente su mantenimiento y desarrollo con Telegram Stars.\n\nAl elegir un monto confirmas que leíste los Términos.`;
}

export function formatTermsMessage() {
  return `📄 *Términos de apoyo*\n\nEl aporte es voluntario. CalcuFlow permanece gratuito y no desbloquea funciones premium. No es una inversión, no promete rendimiento y no compra un servicio financiero.\n\nEl pago se procesa mediante Telegram Stars. Para problemas de pago o reembolsos, usa /paysupport; se aplican los mecanismos de pago de Telegram Stars.\n\nEste resumen informativo no constituye asesoría legal.`;
}

export function formatPaymentSupportMessage({ contactConfigured = false } = {}) {
  const contact = contactConfigured
    ? 'Usa el botón de contacto para solicitar una revisión. Comparte únicamente la fecha aproximada y el monto cuando te lo pidan.'
    : 'Aún no hay un canal de contacto para incidencias de pago. No completes un aporte real hasta que aparezca aquí un medio de contacto.';
  return `🧾 *Problemas con un aporte de Stars*\n\n${contact}\n\nNo publiques comprobantes ni identificadores de pago en grupos. Nunca compartas tu token, contraseña ni códigos de Telegram.`;
}

export function formatPaymentThanksMessage() {
  return `⭐ *¡Gracias por apoyar CalcuFlow!*\n\nTu aporte ayuda a mantener la calculadora y el bot disponibles para la comunidad.`;
}

export function formatGroupRedirectMessage() {
  return 'Para mantener limpio el grupo, usa CalcuFlow aquí:';
}

export function formatPrivateAccessMessage() {
  return 'Puedes usar CalcuFlow sin llenar el grupo.';
}

export function formatPrivateSupportMessage() {
  return 'Continúa el aporte de Stars en privado:';
}

function normalizeBotUsername(botUsername) {
  if (typeof botUsername !== 'string') return '';
  const value = botUsername.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(value) ? value : '';
}

export function buildPrivateBotUrl(botUsername, start = '') {
  const username = normalizeBotUsername(botUsername);
  if (!username) return '';
  return `https://t.me/${username}${start ? `?start=${encodeURIComponent(start)}` : ''}`;
}

function normalizeTelegramUserId(userId) {
  const value = String(userId ?? '').trim();
  return /^\d+$/.test(value) ? value : '';
}

export function addCallbackOwner(callbackData, ownerId) {
  const owner = normalizeTelegramUserId(ownerId);
  if (!owner) return callbackData;
  const ownedData = `${callbackData}${CALLBACK_OWNER_SEPARATOR}${owner}`;
  if (ownedData.length > 64) throw new RangeError('Telegram callback_data exceeds 64 bytes.');
  return ownedData;
}

export function buildTopicUrl(chatId, threadId) {
  const chat = String(chatId ?? '').trim();
  const thread = String(threadId ?? '').trim();
  if (!/^-100\d+$/.test(chat) || !/^\d+$/.test(thread)) return '';
  return `https://t.me/c/${chat.slice(4)}/${thread}`;
}

export function buildHomeInlineKeyboard({ isPrivate = true, botUsername = '', ownerId = null } = {}) {
  const supportUrl = isPrivate ? '' : buildPrivateBotUrl(botUsername, 'support');
  const privateUrl = isPrivate ? '' : buildPrivateBotUrl(botUsername, 'calc');
  const supportButton = supportUrl
    ? { text: '⭐ Apoyar CalcuFlow', url: supportUrl, style: 'success' }
    : { text: '⭐ Apoyar CalcuFlow', callback_data: addCallbackOwner('support', ownerId), style: 'success' };
  const rows = [
    [{ text: '🧮 Calcular', callback_data: addCallbackOwner('banks', ownerId), style: 'primary' }],
    [{ text: '📈 Ver tasas', callback_data: addCallbackOwner('rates', ownerId) }],
    [supportButton],
  ];
  if (privateUrl) rows.push([{ text: '🤖 Usar en privado', url: privateUrl }]);
  rows.push([{ text: '🌐 Abrir CalcuFlow', url: CANONICAL_APP_URL }]);
  return { inline_keyboard: rows };
}

export function buildBankMenuInlineKeyboard(ownerId = null) {
  return { inline_keyboard: [
    ...MENU_BANKS.map(bank => [{ text: bank.label, callback_data: addCallbackOwner(`bank:${bank.id}`, ownerId) }]),
    [{ text: '← Volver', callback_data: addCallbackOwner('home', ownerId) }]
  ] };
}

export function buildAmountMenuInlineKeyboard(bankId, ownerId = null) {
  const bank = resolveBank(bankId);
  return { inline_keyboard: [
    [
      { text: '100 USD', callback_data: addCallbackOwner(`amount:${bank.id}:100`, ownerId) },
      { text: '250 USD', callback_data: addCallbackOwner(`amount:${bank.id}:250`, ownerId) }
    ],
    [
      { text: '500 USD', callback_data: addCallbackOwner(`amount:${bank.id}:500`, ownerId) },
      { text: '1000 USD', callback_data: addCallbackOwner(`amount:${bank.id}:1000`, ownerId) }
    ],
    [{ text: '✏️ Otro monto', callback_data: addCallbackOwner(`custom:${bank.id}`, ownerId) }],
    [{ text: '← Cambiar banco', callback_data: addCallbackOwner('banks', ownerId) }]
  ] };
}

export function buildResultInlineKeyboard(bankId, ownerId = null) {
  const bank = resolveBank(bankId);
  const changeAmountCallback = bank.id === 'custom' ? 'banks' : `bank:${bank.id}`;
  return { inline_keyboard: [
    [{ text: '✏️ Cambiar monto', callback_data: addCallbackOwner(changeAmountCallback, ownerId), style: 'primary' }],
    [{ text: '🏦 Otros bancos', callback_data: addCallbackOwner('banks', ownerId) }],
    [{ text: '📈 Ver tasas', callback_data: addCallbackOwner('rates', ownerId) }],
    [{ text: '🌐 Abrir CalcuFlow', url: CANONICAL_APP_URL }],
    [{ text: '⌂ Inicio', callback_data: addCallbackOwner('home', ownerId) }]
  ] };
}

export function buildRatesInlineKeyboard(ownerId = null) {
  return { inline_keyboard: [
    [{ text: '🧮 Calcular', callback_data: addCallbackOwner('banks', ownerId), style: 'primary' }],
    [{ text: '🌐 Abrir CalcuFlow', url: CANONICAL_APP_URL }],
    [{ text: '⌂ Inicio', callback_data: addCallbackOwner('home', ownerId) }]
  ] };
}

export function buildCustomAmountPanelKeyboard(bankId, ownerId = null) {
  const bank = resolveBank(bankId);
  return { inline_keyboard: [
    [{ text: '← Volver', callback_data: addCallbackOwner(`bank:${bank.id}`, ownerId) }],
    [{ text: '⌂ Inicio', callback_data: addCallbackOwner('home', ownerId) }]
  ] };
}

export function buildSupportInlineKeyboard(ownerId = null) {
  return { inline_keyboard: [
    [
      { text: '⭐ 50', callback_data: addCallbackOwner('stars:50', ownerId), style: 'success' },
      { text: '⭐ 100', callback_data: addCallbackOwner('stars:100', ownerId), style: 'success' }
    ],
    [
      { text: '⭐ 250', callback_data: addCallbackOwner('stars:250', ownerId), style: 'success' },
      { text: '⭐ 500', callback_data: addCallbackOwner('stars:500', ownerId), style: 'success' }
    ],
    [{ text: '✏️ Otro monto', callback_data: addCallbackOwner('stars-custom', ownerId) }],
    [{ text: '📄 Términos', callback_data: addCallbackOwner('terms', ownerId) }],
    [{ text: '← Volver', callback_data: addCallbackOwner('home', ownerId) }]
  ] };
}

function normalizeHttpsUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function buildTermsInlineKeyboard(ownerId = null) {
  return { inline_keyboard: [
    [{ text: '🧾 Problemas con un aporte', callback_data: addCallbackOwner('payment-support', ownerId) }],
    [{ text: '← Volver', callback_data: addCallbackOwner('support', ownerId) }]
  ] };
}

export function buildPaymentSupportInlineKeyboard({ paymentSupportUrl = '', ownerId = null } = {}) {
  const rows = [];
  const contactUrl = normalizeHttpsUrl(paymentSupportUrl);
  if (contactUrl) rows.push([{ text: 'Contactar por un pago', url: contactUrl }]);
  rows.push([{ text: '← Volver', callback_data: addCallbackOwner('terms', ownerId) }]);
  return { inline_keyboard: rows };
}

export function buildThanksInlineKeyboard(ownerId = null) {
  return { inline_keyboard: [[{ text: '🧮 Volver a calcular', callback_data: addCallbackOwner('banks', ownerId), style: 'primary' }]] };
}

export function buildGroupRedirectInlineKeyboard({ chatId, threadId, botUsername } = {}) {
  const rows = [];
  const topicUrl = buildTopicUrl(chatId, threadId);
  const privateUrl = buildPrivateBotUrl(botUsername, 'calc');
  if (topicUrl) rows.push([{ text: '💬 Ir al tema CalcuFlow', url: topicUrl }]);
  if (privateUrl) rows.push([{ text: '🤖 Usar en privado', url: privateUrl, style: 'primary' }]);
  return { inline_keyboard: rows };
}

export function buildPrivateAccessInlineKeyboard(botUsername) {
  const privateUrl = buildPrivateBotUrl(botUsername, 'calc');
  return { inline_keyboard: privateUrl
    ? [[{ text: '🤖 Abrir CalcuFlow en privado', url: privateUrl, style: 'primary' }]]
    : [] };
}

export function buildPrivateSupportInlineKeyboard(botUsername) {
  const privateUrl = buildPrivateBotUrl(botUsername, 'support');
  return { inline_keyboard: privateUrl
    ? [[{ text: '⭐ Apoyar en privado', url: privateUrl, style: 'success' }]]
    : [] };
}

export function parseSupportPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(SUPPORT_PAYLOAD_PREFIX)) return null;
  const suffix = payload.slice(SUPPORT_PAYLOAD_PREFIX.length);
  const customMatch = suffix.match(/^custom:(\d+)$/);
  if (customMatch) {
    const parsed = parseSupportAmount(customMatch[1]);
    return parsed.ok && String(parsed.amount) === customMatch[1]
      ? { amount: parsed.amount, custom: true }
      : null;
  }
  if (!/^\d+$/.test(suffix)) return null;
  const amount = Number(suffix);
  return String(amount) === suffix && SUPPORT_AMOUNTS.includes(amount)
    ? { amount, custom: false }
    : null;
}

export function buildSupportPayload(amount, { custom = false } = {}) {
  if (custom) {
    const parsed = parseSupportAmount(amount);
    return parsed.ok ? `${SUPPORT_PAYLOAD_PREFIX}custom:${parsed.amount}` : '';
  }
  return SUPPORT_AMOUNTS.includes(amount) ? `${SUPPORT_PAYLOAD_PREFIX}${amount}` : '';
}

export function parseAppCallbackData(data) {
  if (typeof data !== 'string') return { type: 'unknown' };
  const raw = data.trim();
  const ownerMatch = raw.match(/^(.*)\|u:(\d+)$/);
  const trimmed = ownerMatch ? ownerMatch[1] : raw;
  const withOwner = parsed => ownerMatch ? { ...parsed, ownerId: ownerMatch[2] } : parsed;
  const simple = {
    home: 'home',
    banks: 'show_banks',
    rates: 'rates',
    tasas: 'rates',
    support: 'support',
    terms: 'terms',
    'stars-custom': 'custom_support_amount',
    'payment-support': 'payment_support'
  };
  if (simple[trimmed]) return withOwner({ type: simple[trimmed] });

  let match = trimmed.match(/^bank:([a-z0-9-]+)$/);
  if (match) return withOwner({ type: 'select_bank', bankId: match[1] });
  match = trimmed.match(/^custom:([a-z0-9-]+)$/);
  if (match) return withOwner({ type: 'custom_amount', bankId: match[1] });
  match = trimmed.match(/^amount:([a-z0-9-]+):(\d+(?:\.\d{1,2})?)$/);
  if (match) {
    const amount = Number(match[2]);
    return amount > 0 && amount <= 1_000_000
      ? withOwner({ type: 'calc', bankId: match[1], amount })
      : withOwner({ type: 'invalid' });
  }
  match = trimmed.match(/^stars:(\d+)$/);
  if (match) {
    const amount = Number(match[1]);
    return SUPPORT_AMOUNTS.includes(amount)
      ? withOwner({ type: 'support_invoice', amount })
      : withOwner({ type: 'invalid_support' });
  }

  if (trimmed.startsWith('calc:')) {
    const parts = trimmed.split(':');
    const amount = Number(parts[1]);
    const bankId = parts.slice(2).join(':').trim() || 'bdv-fisica';
    if (Number.isFinite(amount) && amount > 0 && amount <= 1_000_000) {
      return withOwner({ type: 'calc', amount, bankId });
    }
    return withOwner({ type: 'invalid' });
  }
  return { type: 'unknown' };
}
