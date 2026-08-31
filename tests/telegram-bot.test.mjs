import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTelegramMessage,
  resolveBank,
  formatCalculationResult,
  formatRatesMessage,
  formatHelpMessage,
  formatErrorMessage,
  buildBankInlineKeyboard,
  buildQuickAmountsInlineKeyboard,
  parseCallbackData,
  BANK_ALIASES,
  DEFAULT_BANK,
  CANONICAL_APP_URL
} from '../api/telegram-formatter.mjs';
import {
  createTelegramHandler,
  isChatAuthorized,
  sendTelegramMessage,
  answerTelegramCallbackQuery,
  editTelegramMessageText
} from '../api/telegram.mjs';
import { calculateValues } from '../js/calculator.js';
import { BCV_CURRENT_URL, BCV_HISTORY_URL } from '../js/bcv-rates.js';
import { BINANCE_P2P_URL, DOLARAPI_RATES_URL } from '../api/rate-providers.mjs';

const fixedNow = () => new Date('2026-08-31T12:00:00Z');

function mockFetchResponse(body, { status = 200, headers = {} } = {}) {
  const allHeaders = new Headers(headers);
  if (!allHeaders.has('content-type')) {
    allHeaders.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: allHeaders
  });
}

function createMockRatesFetch({
  bcvRate = 68.50,
  p2pRate = 75.20,
  bcvDate = '2026-08-31',
  failBcv = false,
  failP2p = false
} = {}) {
  return async (url, init = {}) => {
    const urlStr = String(url);

    // Telegram sendMessage endpoint
    if (urlStr.includes('api.telegram.org')) {
      return mockFetchResponse({ ok: true, result: { message_id: 999 } });
    }

    // BCV history
    if (urlStr === BCV_HISTORY_URL) {
      if (failBcv) throw new Error('BCV history failure');
      return mockFetchResponse([{
        USD: bcvRate,
        updated_at: '2026-08-31T09:00:00.000Z',
        effective_date: bcvDate,
        date: bcvDate
      }]);
    }

    // BCV current
    if (urlStr === BCV_CURRENT_URL) {
      if (failBcv) throw new Error('BCV current failure');
      return mockFetchResponse({
        USD: bcvRate,
        updated_at: '2026-08-31T09:00:00.000Z',
        effective_date: bcvDate,
        date: bcvDate
      });
    }

    // Binance P2P
    if (urlStr === BINANCE_P2P_URL) {
      if (failP2p) throw new Error('Binance P2P failure');
      const ads = Array.from({ length: 10 }, () => ({
        adv: { price: String(p2pRate) }
      }));
      return mockFetchResponse({
        code: '000000',
        message: null,
        data: ads,
        total: 10,
        success: true
      });
    }

    // DolarAPI fallback
    if (urlStr === DOLARAPI_RATES_URL) {
      if (failBcv && failP2p) throw new Error('DolarAPI failure');
      return mockFetchResponse([
        { moneda: 'USD', fuente: 'oficial', promedio: failBcv ? null : bcvRate, fechaActualizacion: '2026-08-31T09:00:00.000Z' },
        { moneda: 'USD', fuente: 'paralelo', promedio: failP2p ? null : p2pRate, fechaActualizacion: '2026-08-31T09:00:00.000Z' }
      ]);
    }

    return mockFetchResponse({ error: 'not found' }, { status: 404 });
  };
}

// ---------------------------------------------------------------------------
// Group 1: Command and Message Parsing
// ---------------------------------------------------------------------------

test('parseTelegramMessage parses /start, /ayuda, /help correctly', () => {
  assert.deepEqual(parseTelegramMessage('/start'), { type: 'help' });
  assert.deepEqual(parseTelegramMessage('/start@CalcuFlowBot'), { type: 'help' });
  assert.deepEqual(parseTelegramMessage('/ayuda'), { type: 'help' });
  assert.deepEqual(parseTelegramMessage('/help'), { type: 'help' });
  assert.deepEqual(parseTelegramMessage('ayuda'), { type: 'help' });
  assert.deepEqual(parseTelegramMessage('help'), { type: 'help' });
});

test('parseTelegramMessage parses /tasas and synonyms', () => {
  assert.deepEqual(parseTelegramMessage('/tasas'), { type: 'rates' });
  assert.deepEqual(parseTelegramMessage('/tasas@CalcuFlowBot'), { type: 'rates' });
  assert.deepEqual(parseTelegramMessage('/tasa'), { type: 'rates' });
  assert.deepEqual(parseTelegramMessage('/rates'), { type: 'rates' });
  assert.deepEqual(parseTelegramMessage('tasas'), { type: 'rates' });
  assert.deepEqual(parseTelegramMessage('tasa'), { type: 'rates' });
});

test('parseTelegramMessage parses /calc commands with amount and bank', () => {
  const result1 = parseTelegramMessage('/calc 100');
  assert.equal(result1.type, 'calc');
  assert.equal(result1.amount, 100);
  assert.equal(result1.bankQuery, '');

  const result2 = parseTelegramMessage('/calc 500 bdv');
  assert.equal(result2.type, 'calc');
  assert.equal(result2.amount, 500);
  assert.equal(result2.bankQuery, 'bdv');

  const result3 = parseTelegramMessage('/calc@CalcuFlowBot 200 bbva');
  assert.equal(result3.type, 'calc');
  assert.equal(result3.amount, 200);
  assert.equal(result3.bankQuery, 'bbva');

  const result4 = parseTelegramMessage('/calcular 75.50 banesco');
  assert.equal(result4.type, 'calc');
  assert.equal(result4.amount, 75.5);
  assert.equal(result4.bankQuery, 'banesco');

  const result5 = parseTelegramMessage('/c 100,25 tesoro');
  assert.equal(result5.type, 'calc');
  assert.equal(result5.amount, 100.25);
  assert.equal(result5.bankQuery, 'tesoro');
});

test('parseTelegramMessage parses plain numbers as calc intent', () => {
  const result1 = parseTelegramMessage('100');
  assert.equal(result1.type, 'calc');
  assert.equal(result1.amount, 100);
  assert.equal(result1.bankQuery, '');

  const result2 = parseTelegramMessage('500.50 bbva');
  assert.equal(result2.type, 'calc');
  assert.equal(result2.amount, 500.5);
  assert.equal(result2.bankQuery, 'bbva');

  const result3 = parseTelegramMessage('250,75 bancamiga');
  assert.equal(result3.type, 'calc');
  assert.equal(result3.amount, 250.75);
  assert.equal(result3.bankQuery, 'bancamiga');
});

test('parseTelegramMessage validates and rejects invalid calculation requests', () => {
  const emptyCalc = parseTelegramMessage('/calc');
  assert.equal(emptyCalc.type, 'invalid_calc');
  assert.match(emptyCalc.error, /Indica el monto/);

  const nonNumeric = parseTelegramMessage('/calc abc');
  assert.equal(nonNumeric.type, 'invalid_calc');
  assert.match(nonNumeric.error, /monto numérico válido/);

  const zeroAmount = parseTelegramMessage('/calc 0');
  assert.equal(zeroAmount.type, 'invalid_calc');
  assert.match(zeroAmount.error, /mayor que 0/);

  const oversized = parseTelegramMessage('/calc 2000000');
  assert.equal(oversized.type, 'invalid_calc');
  assert.match(oversized.error, /máximo por cálculo/);
});

test('parseTelegramMessage returns unknown for conversational and invalid input', () => {
  assert.deepEqual(parseTelegramMessage(''), { type: 'unknown' });
  assert.deepEqual(parseTelegramMessage('   '), { type: 'unknown' });
  assert.deepEqual(parseTelegramMessage(null), { type: 'unknown' });
  assert.deepEqual(parseTelegramMessage(undefined), { type: 'unknown' });
  assert.deepEqual(parseTelegramMessage(123), { type: 'unknown' });
  assert.deepEqual(parseTelegramMessage('Hola a todos en el grupo!'), { type: 'unknown' });
  assert.deepEqual(parseTelegramMessage('Buenas tardes'), { type: 'unknown' });
  assert.deepEqual(parseTelegramMessage('/otro_comando'), { type: 'unknown' });
});

// ---------------------------------------------------------------------------
// Group 2: Bank Resolution
// ---------------------------------------------------------------------------

test('resolveBank defaults to Banco de Venezuela when empty', () => {
  assert.deepEqual(resolveBank(''), DEFAULT_BANK);
  assert.deepEqual(resolveBank(null), DEFAULT_BANK);
  assert.deepEqual(resolveBank(undefined), DEFAULT_BANK);
  assert.equal(resolveBank('').id, 'bdv-fisica');
  assert.equal(resolveBank('').fee, 2.5);
});

test('resolveBank identifies known Venezuelan bank aliases', () => {
  assert.equal(resolveBank('bdv').name, 'Banco de Venezuela');
  assert.equal(resolveBank('bdv').fee, 2.5);

  assert.equal(resolveBank('venezuela').name, 'Banco de Venezuela');
  assert.equal(resolveBank('bbva').name, 'BBVA Provincial');
  assert.equal(resolveBank('bbva').fee, 1.5);
  assert.equal(resolveBank('provincial').name, 'BBVA Provincial');

  assert.equal(resolveBank('tesoro').name, 'Banco del Tesoro');
  assert.equal(resolveBank('tesoro').fee, 2.5);
  assert.equal(resolveBank('bt').name, 'Banco del Tesoro');

  assert.equal(resolveBank('bancamiga').name, 'Bancamiga');
  assert.equal(resolveBank('bancamiga').fee, 5.0);

  assert.equal(resolveBank('banesco').name, 'Banesco');
  assert.equal(resolveBank('banesco').fee, 1.5);
  assert.equal(resolveBank('banesco virtual').fee, 2.5);

  assert.equal(resolveBank('bnc').name, 'BNC');
  assert.equal(resolveBank('bnc').fee, 1.5);

  assert.equal(resolveBank('bdt').name, 'Banco Digital de los Trabajadores');
  assert.equal(resolveBank('bdt').fee, 2.5);
});

test('resolveBank parses custom fee percentages', () => {
  const custom3 = resolveBank('3%');
  assert.equal(custom3.id, 'custom');
  assert.equal(custom3.fee, 3);

  const customZero = resolveBank('0%');
  assert.equal(customZero.fee, 0);

  const customDecimal = resolveBank('1.8%');
  assert.equal(customDecimal.fee, 1.8);
});

// ---------------------------------------------------------------------------
// Group 3: Formatting & Presentation
// ---------------------------------------------------------------------------

test('formatCalculationResult produces required emojis and fields', () => {
  const calc = calculateValues({
    requestedUsd: 100,
    bcvRate: 68.50,
    bankMargin: 0,
    p2pRate: 75.20,
    cardFee: 2.5,
    bpayFee: 4.1
  });
  assert.ok(calc);

  const formatted = formatCalculationResult(calc, resolveBank('bdv'));

  // Header
  assert.ok(formatted.includes('📊 *CalcuFlow — Banco ➔ USDT*'));

  // Bank
  assert.ok(formatted.includes('🏦 *Banco:* Banco de Venezuela'));
  assert.ok(formatted.includes('(2,5%)'));

  // Compra
  assert.ok(formatted.includes('💵 *Compra:* 100,00 USD'));

  // Bs necesarios
  assert.ok(formatted.includes('🇻🇪 *Bs necesarios:* 6.850,00 Bs'));

  // Tasas
  assert.ok(formatted.includes('📈 *Tasas:*'));
  assert.ok(formatted.includes('• BCV: 68,50 Bs'));
  assert.ok(formatted.includes('• Banco: 68,50 Bs'));
  assert.ok(formatted.includes('• P2P: 75,20 Bs'));

  // Detalle
  assert.ok(formatted.includes('📋 *Detalle:*'));
  assert.ok(formatted.includes('• Monto en BPay:'));
  assert.ok(formatted.includes('• USDT finales:'));

  // Ganancia / Retorno
  assert.ok(formatted.includes('💰 *Ganancia estimada:* +'));

  // App Link
  assert.ok(formatted.includes(CANONICAL_APP_URL));
});

test('formatRatesMessage presents BCV, P2P, and Spread (brecha)', () => {
  const formatted = formatRatesMessage({
    bcv: 68.50,
    p2p: 75.20,
    bcvDate: '2026-08-31'
  });

  assert.ok(formatted.includes('📈 *Tasas de referencia — CalcuFlow*'));
  assert.ok(formatted.includes('🏦 *BCV:* 68,50 Bs/USD (2026-08-31)'));
  assert.ok(formatted.includes('🔄 *P2P:* 75,20 Bs/USDT'));
  assert.ok(formatted.includes('📊 *Brecha:* +9,78%'));
  assert.ok(formatted.includes(CANONICAL_APP_URL));
});

test('formatHelpMessage and formatErrorMessage provide friendly user output', () => {
  const help = formatHelpMessage();
  assert.ok(help.includes('🤖 *Bot de CalcuFlow — Banco ➔ USDT*'));
  assert.ok(help.includes('/calc'));
  assert.ok(help.includes('/tasas'));
  assert.ok(help.includes('/ayuda'));
  assert.ok(help.includes(CANONICAL_APP_URL));

  const error = formatErrorMessage('Monto no válido');
  assert.equal(error, '⚠️ Monto no válido');
});

// ---------------------------------------------------------------------------
// Group 4: Chat Authorization
// ---------------------------------------------------------------------------

test('isChatAuthorized handles unset, matching, and restricted chats', () => {
  // No restriction configured
  assert.equal(isChatAuthorized(12345, ''), true);
  assert.equal(isChatAuthorized(12345, null), true);
  assert.equal(isChatAuthorized(12345, undefined), true);

  // Single matching chat ID
  assert.equal(isChatAuthorized(12345, '12345'), true);
  assert.equal(isChatAuthorized('-1001234567890', '-1001234567890'), true);
  assert.equal(isChatAuthorized(-1001234567890, '-1001234567890'), true);

  // Multiple comma-separated chat IDs
  assert.equal(isChatAuthorized(999, '123, 999, 456'), true);
  assert.equal(isChatAuthorized(888, '123, 999, 456'), false);

  // Non-matching chat ID
  assert.equal(isChatAuthorized(55555, '12345'), false);
});

// ---------------------------------------------------------------------------
// Group 5: Webhook Handler Flow & End-to-End Tests
// ---------------------------------------------------------------------------

test('createTelegramHandler rejects non-POST HTTP methods', async () => {
  const handler = createTelegramHandler();
  const getResponse = await handler.fetch(new Request('https://example.com/api/telegram', { method: 'GET' }));
  assert.equal(getResponse.status, 405);

  const putResponse = await handler.fetch(new Request('https://example.com/api/telegram', { method: 'PUT' }));
  assert.equal(putResponse.status, 405);
});

test('createTelegramHandler handles malformed JSON body', async () => {
  const handler = createTelegramHandler();
  const response = await handler.fetch(new Request('https://example.com/api/telegram', {
    method: 'POST',
    body: 'invalid-json'
  }));
  assert.equal(response.status, 400);
});

test('createTelegramHandler returns 500 when TELEGRAM_BOT_TOKEN is missing', async () => {
  const handler = createTelegramHandler({
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: '' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 12345 },
        message_id: 1,
        text: '/calc 100'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 500);
});

test('createTelegramHandler warns unauthorized chat and returns 200', async () => {
  let sentPayload = null;
  const mockFetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sentPayload = JSON.parse(init.body);
      return mockFetchResponse({ ok: true });
    }
    return mockFetchResponse({});
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    getEnv: () => ({
      TELEGRAM_BOT_TOKEN: 'test_token',
      TELEGRAM_ALLOWED_CHAT_ID: '-100999999'
    })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: -100111111 }, // Unauthorized chat ID
        message_id: 55,
        text: '/calc 100'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'unauthorized_chat');
  assert.ok(sentPayload);
  assert.equal(sentPayload.chat_id, -100111111);
  assert.ok(sentPayload.text.includes('comunidad oficial'));
});

test('createTelegramHandler ignores casual chat message without sending reply', async () => {
  let sentCount = 0;
  const mockFetch = async (url) => {
    if (String(url).includes('api.telegram.org')) sentCount++;
    return mockFetchResponse({ ok: true });
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 12345 },
        message_id: 2,
        text: 'Hola amigos, ¿alguien sabe si subió el dólar hoy?'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'ignored_unknown_message');
  assert.equal(sentCount, 0); // Did not spam group
});

test('createTelegramHandler responds to /help with help text', async () => {
  let sentPayload = null;
  const mockFetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sentPayload = JSON.parse(init.body);
      return mockFetchResponse({ ok: true });
    }
    return mockFetchResponse({});
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 12345 },
        message_id: 10,
        text: '/ayuda'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  assert.ok(sentPayload);
  assert.equal(sentPayload.chat_id, 12345);
  assert.equal(sentPayload.reply_to_message_id, 10);
  assert.ok(sentPayload.text.includes('Bot de CalcuFlow'));
});

test('createTelegramHandler responds to /tasas with real-time rates', async () => {
  let sentPayload = null;
  const mockRates = createMockRatesFetch({ bcvRate: 68.50, p2pRate: 75.20 });

  const mockFetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sentPayload = JSON.parse(init.body);
      return mockFetchResponse({ ok: true });
    }
    return mockRates(url, init);
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    now: fixedNow,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 12345 },
        message_id: 11,
        text: '/tasas'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  assert.ok(sentPayload);
  assert.ok(sentPayload.text.includes('Tasas de referencia'));
  assert.ok(sentPayload.text.includes('*BCV:* 68,50'));
  assert.ok(sentPayload.text.includes('*P2P:* 75,20'));
});

test('createTelegramHandler calculates /calc 500 bbva successfully', async () => {
  let sentPayload = null;
  const mockRates = createMockRatesFetch({ bcvRate: 68.50, p2pRate: 75.20 });

  const mockFetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sentPayload = JSON.parse(init.body);
      return mockFetchResponse({ ok: true });
    }
    return mockRates(url, init);
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    now: fixedNow,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 12345 },
        message_id: 12,
        text: '/calc 500 bbva'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  assert.ok(sentPayload);
  assert.ok(sentPayload.text.includes('CalcuFlow — Banco ➔ USDT'));
  assert.ok(sentPayload.text.includes('BBVA Provincial'));
  assert.ok(sentPayload.text.includes('*Compra:* 500,00 USD'));
  assert.ok(sentPayload.text.includes('Bs necesarios:'));
  assert.ok(sentPayload.text.includes('USDT finales:'));
  assert.ok(sentPayload.text.includes('Ganancia estimada:'));
});

test('createTelegramHandler calculates plain number input 100', async () => {
  let sentPayload = null;
  const mockRates = createMockRatesFetch({ bcvRate: 68.50, p2pRate: 75.20 });

  const mockFetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sentPayload = JSON.parse(init.body);
      return mockFetchResponse({ ok: true });
    }
    return mockRates(url, init);
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    now: fixedNow,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 12345 },
        message_id: 14,
        text: '100'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  assert.ok(sentPayload);
  assert.ok(sentPayload.text.includes('*Compra:* 100,00 USD'));
  assert.ok(sentPayload.text.includes('Banco de Venezuela'));
});

test('createTelegramHandler handles rate provider failure gracefully', async () => {
  let sentPayload = null;
  const mockRates = createMockRatesFetch({ failBcv: true, failP2p: true });

  const mockFetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sentPayload = JSON.parse(init.body);
      return mockFetchResponse({ ok: true });
    }
    return mockRates(url, init);
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    now: fixedNow,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 12345 },
        message_id: 15,
        text: '/calc 100'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  assert.ok(sentPayload);
  assert.ok(sentPayload.text.includes('No se pudieron obtener las tasas actuales'));
});

// ---------------------------------------------------------------------------
// Group 6: Interactive Inline Keyboards & Callback Data
// ---------------------------------------------------------------------------

test('buildBankInlineKeyboard builds 4 rows of bank buttons with checkmark indicator and web app link', () => {
  const keyboard = buildBankInlineKeyboard(100, 'bdv-fisica');
  assert.ok(keyboard && Array.isArray(keyboard.inline_keyboard));
  assert.equal(keyboard.inline_keyboard.length, 4);

  // Row 1: BDV (selected) & BBVA
  const row1 = keyboard.inline_keyboard[0];
  assert.equal(row1.length, 2);
  assert.equal(row1[0].text, '✓ BDV (2.5%)');
  assert.equal(row1[0].callback_data, 'calc:100:bdv-fisica');
  assert.equal(row1[1].text, 'BBVA (1.5%)');
  assert.equal(row1[1].callback_data, 'calc:100:bbva-provincial');

  // Row 2: Banesco & Bancamiga
  const row2 = keyboard.inline_keyboard[1];
  assert.equal(row2.length, 2);
  assert.equal(row2[0].text, 'Banesco (1.5%)');
  assert.equal(row2[0].callback_data, 'calc:100:banesco-fisica');
  assert.equal(row2[1].text, 'Bancamiga (5.0%)');
  assert.equal(row2[1].callback_data, 'calc:100:bancamiga');

  // Row 3: BNC & Tesoro
  const row3 = keyboard.inline_keyboard[2];
  assert.equal(row3.length, 2);
  assert.equal(row3[0].text, 'BNC (1.5%)');
  assert.equal(row3[0].callback_data, 'calc:100:bnc');
  assert.equal(row3[1].text, 'Tesoro (2.5%)');
  assert.equal(row3[1].callback_data, 'calc:100:banco-tesoro');

  // Row 4: BDT & Web App URL
  const row4 = keyboard.inline_keyboard[3];
  assert.equal(row4.length, 2);
  assert.equal(row4[0].text, 'BDT (2.5%)');
  assert.equal(row4[0].callback_data, 'calc:100:bdt');
  assert.equal(row4[1].text, '🌐 Abrir Web App');
  assert.equal(row4[1].url, CANONICAL_APP_URL);
});

test('buildBankInlineKeyboard updates checkmark for different selected banks and preserves amount', () => {
  // Test selecting BBVA with alias
  const bbvaKeyboard = buildBankInlineKeyboard(500, 'bbva');
  assert.equal(bbvaKeyboard.inline_keyboard[0][0].text, 'BDV (2.5%)');
  assert.equal(bbvaKeyboard.inline_keyboard[0][0].callback_data, 'calc:500:bdv-fisica');
  assert.equal(bbvaKeyboard.inline_keyboard[0][1].text, '✓ BBVA (1.5%)');
  assert.equal(bbvaKeyboard.inline_keyboard[0][1].callback_data, 'calc:500:bbva-provincial');

  // Test selecting Bancamiga
  const bancamigaKeyboard = buildBankInlineKeyboard(250.5, 'bancamiga');
  assert.equal(bancamigaKeyboard.inline_keyboard[1][1].text, '✓ Bancamiga (5.0%)');
  assert.equal(bancamigaKeyboard.inline_keyboard[1][1].callback_data, 'calc:250.5:bancamiga');

  // Test selecting Tesoro
  const tesoroKeyboard = buildBankInlineKeyboard(1000, 'banco-tesoro');
  assert.equal(tesoroKeyboard.inline_keyboard[2][1].text, '✓ Tesoro (2.5%)');
  assert.equal(tesoroKeyboard.inline_keyboard[2][1].callback_data, 'calc:1000:banco-tesoro');

  // Test selecting BDT
  const bdtKeyboard = buildBankInlineKeyboard(50, 'bdt');
  assert.equal(bdtKeyboard.inline_keyboard[3][0].text, '✓ BDT (2.5%)');
  assert.equal(bdtKeyboard.inline_keyboard[3][0].callback_data, 'calc:50:bdt');
});

test('buildQuickAmountsInlineKeyboard contains 3 rows of quick amounts, rates, and web app link', () => {
  const keyboard = buildQuickAmountsInlineKeyboard();
  assert.ok(keyboard && Array.isArray(keyboard.inline_keyboard));
  assert.equal(keyboard.inline_keyboard.length, 3);

  // Row 1: 100 USD and 200 USD
  const row1 = keyboard.inline_keyboard[0];
  assert.equal(row1.length, 2);
  assert.equal(row1[0].text, '💵 100 USD');
  assert.equal(row1[0].callback_data, 'calc:100:bdv-fisica');
  assert.equal(row1[1].text, '💵 200 USD');
  assert.equal(row1[1].callback_data, 'calc:200:bdv-fisica');

  // Row 2: 500 USD and 1000 USD
  const row2 = keyboard.inline_keyboard[1];
  assert.equal(row2.length, 2);
  assert.equal(row2[0].text, '💵 500 USD');
  assert.equal(row2[0].callback_data, 'calc:500:bdv-fisica');
  assert.equal(row2[1].text, '💵 1000 USD');
  assert.equal(row2[1].callback_data, 'calc:1000:bdv-fisica');

  // Row 3: Ver Tasas and Web App URL
  const row3 = keyboard.inline_keyboard[2];
  assert.equal(row3.length, 2);
  assert.equal(row3[0].text, '📈 Ver Tasas');
  assert.equal(row3[0].callback_data, 'rates');
  assert.equal(row3[1].text, '🌐 Abrir Web App');
  assert.equal(row3[1].url, CANONICAL_APP_URL);
});

test('parseCallbackData parses valid calculation and rates payloads', () => {
  assert.deepEqual(parseCallbackData('rates'), { type: 'rates' });
  assert.deepEqual(parseCallbackData('tasas'), { type: 'rates' });
  assert.deepEqual(parseCallbackData('calc:100:bdv-fisica'), {
    type: 'calc',
    amount: 100,
    bankId: 'bdv-fisica'
  });
  assert.deepEqual(parseCallbackData('calc:500.25:bbva-provincial'), {
    type: 'calc',
    amount: 500.25,
    bankId: 'bbva-provincial'
  });
  assert.deepEqual(parseCallbackData('calc:1000:banesco-fisica'), {
    type: 'calc',
    amount: 1000,
    bankId: 'banesco-fisica'
  });
  assert.deepEqual(parseCallbackData('calc:200:'), {
    type: 'calc',
    amount: 200,
    bankId: 'bdv-fisica'
  });
});

test('parseCallbackData safely handles invalid or malformed callback data', () => {
  assert.deepEqual(parseCallbackData('calc:abc:bdv-fisica'), { type: 'invalid' });
  assert.deepEqual(parseCallbackData('calc:-10:bdv-fisica'), { type: 'invalid' });
  assert.deepEqual(parseCallbackData('calc:0:bdv-fisica'), { type: 'invalid' });
  assert.deepEqual(parseCallbackData('calc:5000000:bdv-fisica'), { type: 'invalid' });
  assert.deepEqual(parseCallbackData('unknown_action'), { type: 'unknown' });
  assert.deepEqual(parseCallbackData(''), { type: 'unknown' });
  assert.deepEqual(parseCallbackData(null), { type: 'unknown' });
  assert.deepEqual(parseCallbackData(undefined), { type: 'unknown' });
  assert.deepEqual(parseCallbackData(123), { type: 'unknown' });
});

// ---------------------------------------------------------------------------
// Group 7: Telegram API Methods (answerCallbackQuery, editMessageText, sendMessage with replyMarkup)
// ---------------------------------------------------------------------------

test('sendTelegramMessage sends reply_markup in payload when provided', async () => {
  let requestUrl = null;
  let requestBody = null;

  const mockFetch = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(init.body);
    return mockFetchResponse({ ok: true, result: { message_id: 101 } });
  };

  const keyboard = buildQuickAmountsInlineKeyboard();
  await sendTelegramMessage({
    fetchImpl: mockFetch,
    botToken: 'bot_test_token',
    chatId: 12345,
    text: 'Hola',
    replyMarkup: keyboard
  });

  assert.ok(requestUrl.includes('/botbot_test_token/sendMessage'));
  assert.equal(requestBody.chat_id, 12345);
  assert.equal(requestBody.text, 'Hola');
  assert.deepEqual(requestBody.reply_markup, keyboard);
});

test('answerTelegramCallbackQuery calls answerCallbackQuery endpoint with parameters', async () => {
  let requestUrl = null;
  let requestBody = null;

  const mockFetch = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(init.body);
    return mockFetchResponse({ ok: true });
  };

  await answerTelegramCallbackQuery({
    fetchImpl: mockFetch,
    botToken: 'bot_test_token',
    callbackQueryId: 'query_123',
    text: 'Cargando...',
    showAlert: false
  });

  assert.ok(requestUrl.includes('/botbot_test_token/answerCallbackQuery'));
  assert.equal(requestBody.callback_query_id, 'query_123');
  assert.equal(requestBody.text, 'Cargando...');

  // Parameter validation
  await assert.rejects(
    async () => answerTelegramCallbackQuery({ botToken: '', callbackQueryId: '123' }),
    /Missing required Telegram answerCallbackQuery parameters/
  );
});

test('editTelegramMessageText calls editMessageText endpoint with markdown and reply_markup', async () => {
  let requestUrl = null;
  let requestBody = null;

  const mockFetch = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(init.body);
    return mockFetchResponse({ ok: true });
  };

  const keyboard = buildBankInlineKeyboard(100, 'bdv-fisica');
  await editTelegramMessageText({
    fetchImpl: mockFetch,
    botToken: 'bot_test_token',
    chatId: 12345,
    messageId: 50,
    text: '*Resultado actualizado*',
    replyMarkup: keyboard
  });

  assert.ok(requestUrl.includes('/botbot_test_token/editMessageText'));
  assert.equal(requestBody.chat_id, 12345);
  assert.equal(requestBody.message_id, 50);
  assert.equal(requestBody.text, '*Resultado actualizado*');
  assert.equal(requestBody.parse_mode, 'Markdown');
  assert.deepEqual(requestBody.reply_markup, keyboard);

  // Parameter validation
  await assert.rejects(
    async () => editTelegramMessageText({ botToken: '', chatId: 12345, messageId: 50, text: 'hi' }),
    /Missing required Telegram editMessageText parameters/
  );
});

// ---------------------------------------------------------------------------
// Group 8: Webhook Callback Query Handling
// ---------------------------------------------------------------------------

test('createTelegramHandler processes callback_query for rates and edits message', async () => {
  const answeredQueries = [];
  const editedMessages = [];
  const mockRates = createMockRatesFetch({ bcvRate: 68.50, p2pRate: 75.20 });

  const mockFetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes('/answerCallbackQuery')) {
      answeredQueries.push(JSON.parse(init.body));
      return mockFetchResponse({ ok: true });
    }
    if (urlStr.includes('/editMessageText')) {
      editedMessages.push(JSON.parse(init.body));
      return mockFetchResponse({ ok: true });
    }
    return mockRates(url, init);
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    now: fixedNow,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      callback_query: {
        id: 'cb_query_rates_1',
        from: { id: 12345 },
        message: {
          message_id: 100,
          chat: { id: 12345 },
          text: 'Anterior'
        },
        data: 'rates'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'rates_sent');

  // Verify answerCallbackQuery was called
  assert.equal(answeredQueries.length, 1);
  assert.equal(answeredQueries[0].callback_query_id, 'cb_query_rates_1');

  // Verify editMessageText was called with rates
  assert.equal(editedMessages.length, 1);
  assert.equal(editedMessages[0].chat_id, 12345);
  assert.equal(editedMessages[0].message_id, 100);
  assert.ok(editedMessages[0].text.includes('Tasas de referencia'));
  assert.ok(editedMessages[0].text.includes('*BCV:* 68,50'));
  assert.ok(editedMessages[0].text.includes('*P2P:* 75,20'));
  assert.ok(editedMessages[0].reply_markup);
});

test('createTelegramHandler processes callback_query for calc and updates bank selection', async () => {
  const answeredQueries = [];
  const editedMessages = [];
  const mockRates = createMockRatesFetch({ bcvRate: 68.50, p2pRate: 75.20 });

  const mockFetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes('/answerCallbackQuery')) {
      answeredQueries.push(JSON.parse(init.body));
      return mockFetchResponse({ ok: true });
    }
    if (urlStr.includes('/editMessageText')) {
      editedMessages.push(JSON.parse(init.body));
      return mockFetchResponse({ ok: true });
    }
    return mockRates(url, init);
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    now: fixedNow,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      callback_query: {
        id: 'cb_query_calc_bbva',
        from: { id: 12345 },
        message: {
          message_id: 105,
          chat: { id: 12345 },
          text: 'Anterior'
        },
        data: 'calc:500:bbva-provincial'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'calc_sent');

  // Verify answerCallbackQuery was called
  assert.equal(answeredQueries.length, 1);
  assert.equal(answeredQueries[0].callback_query_id, 'cb_query_calc_bbva');

  // Verify editMessageText was called with calculated 500 USD and BBVA
  assert.equal(editedMessages.length, 1);
  assert.equal(editedMessages[0].chat_id, 12345);
  assert.equal(editedMessages[0].message_id, 105);
  assert.ok(editedMessages[0].text.includes('BBVA Provincial (1,5%)'));
  assert.ok(editedMessages[0].text.includes('*Compra:* 500,00 USD'));

  // Verify keyboard updated with checkmark on BBVA
  const replyMarkup = editedMessages[0].reply_markup;
  assert.ok(replyMarkup && replyMarkup.inline_keyboard);
  assert.equal(replyMarkup.inline_keyboard[0][0].text, 'BDV (2.5%)');
  assert.equal(replyMarkup.inline_keyboard[0][1].text, '✓ BBVA (1.5%)');
});

test('createTelegramHandler rejects callback_query from unauthorized chat', async () => {
  const answeredQueries = [];
  let editCount = 0;

  const mockFetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes('/answerCallbackQuery')) {
      answeredQueries.push(JSON.parse(init.body));
      return mockFetchResponse({ ok: true });
    }
    if (urlStr.includes('/editMessageText')) {
      editCount++;
      return mockFetchResponse({ ok: true });
    }
    return mockFetchResponse({});
  };

  const handler = createTelegramHandler({
    fetchImpl: mockFetch,
    getEnv: () => ({
      TELEGRAM_BOT_TOKEN: 'test_token',
      TELEGRAM_ALLOWED_CHAT_ID: '-100999999'
    })
  });

  const request = new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      callback_query: {
        id: 'cb_unauthorized',
        from: { id: -100111111 },
        message: {
          message_id: 110,
          chat: { id: -100111111 }
        },
        data: 'calc:100:bdv-fisica'
      }
    })
  });

  const response = await handler.fetch(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'unauthorized_chat');
  assert.equal(answeredQueries.length, 1);
  assert.equal(answeredQueries[0].show_alert, true);
  assert.ok(answeredQueries[0].text.toLowerCase().includes('no autorizado'));
  assert.equal(editCount, 0);
});

