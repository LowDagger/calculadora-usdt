import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_APP_URL,
  formatHelpMessage,
  formatRatesMessage
} from '../api/telegram-formatter.mjs';
import {
  SUPPORT_AMOUNTS,
  SUPPORT_PAYLOAD_PREFIX,
  MIN_SUPPORT_AMOUNT,
  MAX_SUPPORT_AMOUNT,
  addCallbackOwner,
  buildAmountMenuInlineKeyboard,
  buildBankMenuInlineKeyboard,
  buildHomeInlineKeyboard,
  buildPrivateBotUrl,
  buildPaymentSupportInlineKeyboard,
  buildResultInlineKeyboard,
  buildSupportInlineKeyboard,
  buildSupportPayload,
  formatAppCalculationResult,
  formatCustomAmountPrompt,
  formatCustomSupportPrompt,
  formatPaymentSupportMessage,
  formatSupportMessage,
  formatTermsMessage,
  parseAppCallbackData,
  parseCustomAmountReply,
  parseCustomSupportReply,
  parseSupportAmount,
  parseSupportPayload
} from '../api/telegram-ui.mjs';
import {
  TELEGRAM_BANK_MARGIN,
  getConfiguredThreadId,
  getTelegramAccessContext,
  validatePreCheckoutQuery,
  validateSuccessfulPayment
} from '../api/telegram-app-handler.mjs';
import {
  createTelegramHandler,
  sendTelegramInvoice,
  sendTelegramMessage
} from '../api/telegram.mjs';
import { calculateValues, currentBankRate } from '../js/calculator.js';
import { BCV_CURRENT_URL, BCV_HISTORY_URL } from '../js/bcv-rates.js';
import { BINANCE_P2P_URL, DOLARAPI_RATES_URL } from '../api/rate-providers.mjs';

const fixedNow = () => new Date('2026-09-01T04:00:00.000Z');
const PRIVATE_CHAT_ID = 123456789;
const SECOND_USER_ID = 987654321;
const OFFICIAL_CHAT_ID = -1001234567890;
const BOT_THREAD_ID = 777;

function response(body = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function createHarness({ failMethods = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const urlString = String(url);
    if (urlString.includes('api.telegram.org')) {
      const method = urlString.split('/').at(-1);
      const payload = init.body ? JSON.parse(init.body) : null;
      calls.push({ method, payload });
      if (failMethods.includes(method)) return response({ ok: false, description: 'test failure' }, 500);
      return response({ ok: true, result: { message_id: 999 } });
    }
    if (urlString === BCV_HISTORY_URL) {
      return response([{
        USD: 68.5,
        updated_at: '2026-09-01T03:00:00.000Z',
        effective_date: '2026-09-01',
        date: '2026-09-01'
      }]);
    }
    if (urlString === BCV_CURRENT_URL) {
      return response({
        USD: 68.5,
        updated_at: '2026-09-01T03:00:00.000Z',
        effective_date: '2026-09-01',
        date: '2026-09-01'
      });
    }
    if (urlString === BINANCE_P2P_URL) {
      return response({
        code: '000000',
        success: true,
        data: Array.from({ length: 10 }, () => ({ adv: { price: '75.2' } }))
      });
    }
    if (urlString === DOLARAPI_RATES_URL) return response([]);
    return response({ ok: false }, 404);
  };
  return { calls, fetchImpl };
}

function webhookRequest(update) {
  return new Request('https://example.test/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update)
  });
}

function createHandler(harness, env = {}) {
  return createTelegramHandler({
    fetchImpl: harness.fetchImpl,
    now: fixedNow,
    getEnv: () => ({
      TELEGRAM_BOT_TOKEN: 'test_token',
      TELEGRAM_ALLOWED_CHAT_ID: String(OFFICIAL_CHAT_ID),
      TELEGRAM_ALLOWED_THREAD_ID: String(BOT_THREAD_ID),
      TELEGRAM_BOT_USERNAME: 'calcuflowbot',
      ...env
    })
  });
}

test('home and help keep the production URL in an inline button only', () => {
  const home = buildHomeInlineKeyboard();
  assert.equal(home.inline_keyboard[0][0].callback_data, 'banks');
  assert.equal(home.inline_keyboard[0][0].style, 'primary');
  assert.equal(home.inline_keyboard[2][0].callback_data, 'support');
  assert.equal(home.inline_keyboard[3][0].url, CANONICAL_APP_URL);
  assert.ok(!formatHelpMessage().includes(CANONICAL_APP_URL));
  assert.ok(!formatRatesMessage({ bcv: 68.5, p2p: 75.2 }).includes(CANONICAL_APP_URL));
});

test('bank and amount menus are mobile-first and preserve selected bank', () => {
  const banks = buildBankMenuInlineKeyboard().inline_keyboard;
  assert.equal(banks.length, 8);
  assert.ok(banks.slice(0, 7).every(row => row.length === 1));
  const amounts = buildAmountMenuInlineKeyboard('bbva-provincial').inline_keyboard.flat();
  assert.ok(amounts.some(button => button.callback_data === 'amount:bbva-provincial:100'));
  assert.ok(amounts.some(button => button.callback_data === 'amount:bbva-provincial:250'));
  assert.ok(amounts.some(button => button.callback_data === 'custom:bbva-provincial'));
  assert.ok(!JSON.stringify(amounts).includes('amount:bdv-fisica'));
});

test('navigation callbacks remain compact and include back/home/result actions', () => {
  assert.deepEqual(parseAppCallbackData('home'), { type: 'home' });
  assert.deepEqual(parseAppCallbackData('banks'), { type: 'show_banks' });
  assert.deepEqual(parseAppCallbackData('bank:bnc'), { type: 'select_bank', bankId: 'bnc' });
  assert.deepEqual(parseAppCallbackData('amount:bnc:500'), { type: 'calc', bankId: 'bnc', amount: 500 });
  assert.deepEqual(parseAppCallbackData('custom:bnc'), { type: 'custom_amount', bankId: 'bnc' });
  assert.deepEqual(parseAppCallbackData('nonsense'), { type: 'unknown' });
  const resultButtons = buildResultInlineKeyboard('bnc').inline_keyboard.flat();
  assert.ok(resultButtons.some(button => button.callback_data === 'bank:bnc'));
  assert.ok(resultButtons.some(button => button.callback_data === 'banks'));
  assert.ok(resultButtons.some(button => button.callback_data === 'rates'));
  assert.ok(resultButtons.some(button => button.callback_data === 'home'));
  assert.ok(resultButtons.some(button => button.url === CANONICAL_APP_URL));
  assert.ok(resultButtons.filter(button => button.callback_data).every(button => button.callback_data.length <= 64));
});

test('owned callbacks stay below Telegram limits and preserve the initiating user', () => {
  const ownerId = '123456789012345';
  const callback = addCallbackOwner('amount:bbva-provincial:1000', ownerId);
  assert.ok(callback.length <= 64);
  assert.deepEqual(parseAppCallbackData(callback), {
    type: 'calc', bankId: 'bbva-provincial', amount: 1000, ownerId
  });

  const groupHome = buildHomeInlineKeyboard({
    isPrivate: false,
    botUsername: 'calcuflowbot',
    ownerId
  });
  assert.ok(JSON.stringify(groupHome).includes('https://t.me/calcuflowbot?start=calc'));
});

test('custom amount replies are stateless, validated, and strictly tied to a bot prompt', () => {
  const prompt = formatCustomAmountPrompt('bancamiga', 77);
  const valid = parseCustomAmountReply({
    text: '375,50',
    reply_to_message: { message_id: 88, from: { is_bot: true }, text: prompt }
  });
  assert.deepEqual(valid, {
    bankId: 'bancamiga', panelMessageId: 77, promptMessageId: 88, ok: true, amount: 375.5
  });
  const invalid = parseCustomAmountReply({
    text: 'abc',
    reply_to_message: { message_id: 88, from: { is_bot: true }, text: prompt }
  });
  assert.equal(invalid.ok, false);
  assert.equal(parseCustomAmountReply({ text: '375' }), null);
  assert.equal(parseCustomAmountReply({
    text: '375',
    reply_to_message: { from: { is_bot: false }, text: prompt }
  }), null);
});

test('private chats remain allowed independently of official group configuration', () => {
  const context = getTelegramAccessContext({ id: PRIVATE_CHAT_ID, type: 'private' }, null, {
    TELEGRAM_ALLOWED_CHAT_ID: String(OFFICIAL_CHAT_ID),
    TELEGRAM_ALLOWED_THREAD_ID: String(BOT_THREAD_ID)
  });
  assert.equal(context.allowed, true);
  assert.equal(context.isPrivate, true);
});

test('official group topic routing allows the configured topic and redirects General', () => {
  const env = {
    TELEGRAM_ALLOWED_CHAT_ID: String(OFFICIAL_CHAT_ID),
    TELEGRAM_ALLOWED_THREAD_ID: String(BOT_THREAD_ID)
  };
  assert.equal(getTelegramAccessContext({ id: OFFICIAL_CHAT_ID, type: 'supergroup' }, BOT_THREAD_ID, env).allowed, true);
  assert.equal(getTelegramAccessContext({ id: OFFICIAL_CHAT_ID, type: 'supergroup' }, 1, env).allowed, false);
  assert.equal(getTelegramAccessContext({ id: -1009999999999, type: 'supergroup' }, BOT_THREAD_ID, env).allowed, false);
  assert.equal(getTelegramAccessContext({ id: OFFICIAL_CHAT_ID, type: 'supergroup' }, 1, {
    TELEGRAM_ALLOWED_CHAT_ID: String(OFFICIAL_CHAT_ID)
  }).allowed, true);
});

test('per-group thread mappings restrict one group without blocking an unmapped QA group', () => {
  const secondGroupId = -1009876543210;
  const env = {
    TELEGRAM_ALLOWED_CHAT_ID: `${OFFICIAL_CHAT_ID},${secondGroupId}`,
    TELEGRAM_ALLOWED_THREAD_ID: '999',
    TELEGRAM_ALLOWED_THREADS: `${OFFICIAL_CHAT_ID}:${BOT_THREAD_ID}`
  };
  assert.equal(getConfiguredThreadId(OFFICIAL_CHAT_ID, env), String(BOT_THREAD_ID));
  assert.equal(getConfiguredThreadId(secondGroupId, env), '');
  assert.equal(getTelegramAccessContext({ id: OFFICIAL_CHAT_ID, type: 'supergroup' }, BOT_THREAD_ID, env).allowed, true);
  assert.equal(getTelegramAccessContext({ id: OFFICIAL_CHAT_ID, type: 'supergroup' }, 1, env).allowed, false);
  assert.equal(getTelegramAccessContext({ id: secondGroupId, type: 'supergroup' }, null, env).allowed, true);
});

test('sendMessage preserves topic ID and disables link previews', async () => {
  const harness = createHarness();
  await sendTelegramMessage({
    fetchImpl: harness.fetchImpl,
    botToken: 'test_token',
    chatId: OFFICIAL_CHAT_ID,
    text: 'Prueba',
    messageThreadId: BOT_THREAD_ID
  });
  const payload = harness.calls.at(-1).payload;
  assert.equal(payload.message_thread_id, BOT_THREAD_ID);
  assert.deepEqual(payload.link_preview_options, { is_disabled: true });
});

test('Telegram test mode uses the official isolated /test method path', async () => {
  let requestedUrl = '';
  await sendTelegramMessage({
    fetchImpl: async url => {
      requestedUrl = String(url);
      return response({ ok: true });
    },
    botToken: 'test_token',
    chatId: PRIVATE_CHAT_ID,
    text: 'Prueba',
    testMode: true
  });
  assert.equal(requestedUrl, 'https://api.telegram.org/bottest_token/test/sendMessage');
});

test('private /start renders the app home and /calc renders bank selection', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  await handler.fetch(webhookRequest({ message: {
    message_id: 1, from: { id: PRIVATE_CHAT_ID }, chat: { id: PRIVATE_CHAT_ID, type: 'private' }, text: '/start'
  } }));
  await handler.fetch(webhookRequest({ message: {
    message_id: 2, from: { id: PRIVATE_CHAT_ID }, chat: { id: PRIVATE_CHAT_ID, type: 'private' }, text: '/calc'
  } }));
  const sends = harness.calls.filter(call => call.method === 'sendMessage');
  assert.match(sends[0].payload.text, /¿Qué quieres hacer\?/);
  assert.equal(sends[0].payload.reply_markup.inline_keyboard[0][0].callback_data, addCallbackOwner('banks', PRIVATE_CHAT_ID));
  assert.match(sends[1].payload.text, /Elige un banco/);
});

test('private deep link, aliases, and /privado open independent calculator UI', async () => {
  assert.equal(buildPrivateBotUrl('calcuflowbot', 'calc'), 'https://t.me/calcuflowbot?start=calc');
  const harness = createHarness();
  const handler = createHandler(harness);
  const commands = [
    ['/start calc', 'banks_sent'],
    ['/calcular', 'banks_sent'],
    ['/bancos', 'banks_sent'],
    ['/privado', 'home_sent'],
    ['/calcular 500', 'calc_sent'],
    ['/calcular 500 bdv', 'calc_sent']
  ];
  for (const [text, expectedStatus] of commands) {
    const result = await handler.fetch(webhookRequest({ message: {
      message_id: 200 + harness.calls.length,
      from: { id: PRIVATE_CHAT_ID },
      chat: { id: PRIVATE_CHAT_ID, type: 'private' },
      text
    } }));
    assert.equal((await result.json()).status, expectedStatus, text);
  }
  assert.ok(harness.calls.filter(call => call.method === 'sendMessage').every(call => (
    call.payload.chat_id === PRIVATE_CHAT_ID
  )));
});

test('required private and official-group command matrices remain supported', async () => {
  const privateHarness = createHarness();
  const privateHandler = createHandler(privateHarness);
  const privateCommands = [
    ['/start', 'home_sent'],
    ['/calcular', 'banks_sent'],
    ['/calc 500 bdv', 'calc_sent'],
    ['/bancos', 'banks_sent'],
    ['/tasas', 'rates_sent'],
    ['/privado', 'home_sent']
  ];
  for (const [text, expectedStatus] of privateCommands) {
    const result = await privateHandler.fetch(webhookRequest({ message: {
      message_id: 500 + privateHarness.calls.length,
      from: { id: PRIVATE_CHAT_ID },
      chat: { id: PRIVATE_CHAT_ID, type: 'private' },
      text
    } }));
    assert.equal((await result.json()).status, expectedStatus, text);
  }

  const groupHarness = createHarness();
  const groupHandler = createHandler(groupHarness);
  const groupCommands = [
    ['/start@calcuflowbot', 'home_sent'],
    ['/calcular@calcuflowbot', 'banks_sent'],
    ['/calc@calcuflowbot 500 bdv', 'calc_sent'],
    ['/tasas@calcuflowbot', 'rates_sent']
  ];
  for (const [text, expectedStatus] of groupCommands) {
    const result = await groupHandler.fetch(webhookRequest({ message: {
      message_id: 600 + groupHarness.calls.length,
      message_thread_id: BOT_THREAD_ID,
      from: { id: PRIVATE_CHAT_ID },
      chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
      text
    } }));
    assert.equal((await result.json()).status, expectedStatus, text);
  }
  const groupSends = groupHarness.calls.filter(call => call.method === 'sendMessage');
  assert.equal(groupSends.length, groupCommands.length);
  assert.ok(groupSends.every(call => call.payload.message_thread_id === BOT_THREAD_ID));
});

test('group /privado responds privately with the calculator deep link', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 210,
    message_thread_id: BOT_THREAD_ID,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '/privado'
  } }));
  assert.equal((await result.json()).status, 'ephemeral_private_access');
  const send = harness.calls.find(call => call.method === 'sendMessage');
  assert.equal(send.payload.ephemeral_message_parameters.receiver_user_id, PRIVATE_CHAT_ID);
  assert.match(send.payload.text, /sin llenar el grupo/);
  assert.ok(JSON.stringify(send.payload.reply_markup).includes('https://t.me/calcuflowbot?start=calc'));
});

test('navigation callbacks edit the existing message and keep the chosen bank', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const responseValue = await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-bank',
    from: { id: PRIVATE_CHAT_ID },
    message: { message_id: 10, chat: { id: PRIVATE_CHAT_ID, type: 'private' }, text: 'menu' },
    data: 'bank:bbva-provincial'
  } }));
  assert.equal((await responseValue.json()).status, 'amounts_sent');
  const edit = harness.calls.find(call => call.method === 'editMessageText');
  assert.equal(edit.payload.message_id, 10);
  assert.match(edit.payload.text, /BBVA Provincial/);
  assert.ok(JSON.stringify(edit.payload.reply_markup).includes('amount:bbva-provincial:500'));
});

test('two group users keep independent owned panels and cannot mutate each other', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  await handler.fetch(webhookRequest({ message: {
    message_id: 21,
    message_thread_id: BOT_THREAD_ID,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '/calcular'
  } }));
  const userAPanel = harness.calls.filter(call => call.method === 'sendMessage').at(-1).payload;
  const userABankCallback = userAPanel.reply_markup.inline_keyboard[0][0].callback_data;
  assert.equal(parseAppCallbackData(userABankCallback).ownerId, String(PRIVATE_CHAT_ID));

  await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-user-a-bank',
    from: { id: PRIVATE_CHAT_ID },
    message: {
      message_id: 301,
      message_thread_id: BOT_THREAD_ID,
      chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
      reply_to_message: { message_id: 21, from: { id: PRIVATE_CHAT_ID } }
    },
    data: userABankCallback
  } }));
  const userAAmountPanel = harness.calls.filter(call => call.method === 'editMessageText').at(-1).payload;
  const userAAmountCallback = userAAmountPanel.reply_markup.inline_keyboard[1][0].callback_data;
  assert.equal(parseAppCallbackData(userAAmountCallback).ownerId, String(PRIVATE_CHAT_ID));

  const editsBeforeWrongUser = harness.calls.filter(call => call.method === 'editMessageText').length;
  const wrongUserResult = await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-user-b-on-a',
    from: { id: SECOND_USER_ID },
    message: {
      message_id: 301,
      message_thread_id: BOT_THREAD_ID,
      chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' }
    },
    data: userAAmountCallback
  } }));
  assert.equal((await wrongUserResult.json()).status, 'wrong_callback_owner');
  assert.equal(harness.calls.filter(call => call.method === 'editMessageText').length, editsBeforeWrongUser);
  const wrongUserAnswer = harness.calls.find(call => (
    call.method === 'answerCallbackQuery' && call.payload.callback_query_id === 'cb-user-b-on-a'
  ));
  assert.match(wrongUserAnswer.payload.text, /pertenece a otro usuario/);
  assert.equal(wrongUserAnswer.payload.show_alert, true);

  await handler.fetch(webhookRequest({ message: {
    message_id: 22,
    message_thread_id: BOT_THREAD_ID,
    from: { id: SECOND_USER_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '/calcular'
  } }));
  const userBPanel = harness.calls.filter(call => call.method === 'sendMessage').at(-1).payload;
  const userBBankCallback = userBPanel.reply_markup.inline_keyboard[1][0].callback_data;
  assert.equal(parseAppCallbackData(userBBankCallback).ownerId, String(SECOND_USER_ID));

  await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-user-b-bank',
    from: { id: SECOND_USER_ID },
    message: { message_id: 302, message_thread_id: BOT_THREAD_ID, chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' } },
    data: userBBankCallback
  } }));
  await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-user-a-calc',
    from: { id: PRIVATE_CHAT_ID },
    message: { message_id: 301, message_thread_id: BOT_THREAD_ID, chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' } },
    data: userAAmountCallback
  } }));

  const successfulEdits = harness.calls.filter(call => call.method === 'editMessageText').map(call => call.payload.message_id);
  assert.ok(successfulEdits.includes(301));
  assert.ok(successfulEdits.includes(302));
});

test('official bot topic replies stay in topic while General gets an ephemeral redirect', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  await handler.fetch(webhookRequest({ message: {
    message_id: 11,
    message_thread_id: BOT_THREAD_ID,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '/start'
  } }));
  await handler.fetch(webhookRequest({ message: {
    message_id: 12,
    message_thread_id: 1,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '/calc 500 bdv'
  } }));
  const sends = harness.calls.filter(call => call.method === 'sendMessage');
  assert.equal(sends[0].payload.message_thread_id, BOT_THREAD_ID);
  assert.deepEqual(sends[1].payload.ephemeral_message_parameters, { receiver_user_id: PRIVATE_CHAT_ID });
  assert.ok(JSON.stringify(sends[1].payload.reply_markup).includes(`/c/1234567890/${BOT_THREAD_ID}`));
  assert.ok(JSON.stringify(sends[1].payload.reply_markup).includes('t.me/calcuflowbot'));
});

test('General redirect falls back to one lightweight persistent message when ephemeral is unsupported', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = String(url).split('/').at(-1);
    const payload = JSON.parse(init.body);
    calls.push({ method, payload });
    if (method === 'sendMessage' && payload.ephemeral_message_parameters) {
      return response({ ok: false, description: 'unsupported' }, 500);
    }
    return response({ ok: true });
  };
  const handler = createTelegramHandler({
    fetchImpl,
    getEnv: () => ({
      TELEGRAM_BOT_TOKEN: 'test_token',
      TELEGRAM_ALLOWED_CHAT_ID: String(OFFICIAL_CHAT_ID),
      TELEGRAM_ALLOWED_THREAD_ID: String(BOT_THREAD_ID),
      TELEGRAM_BOT_USERNAME: 'calcuflowbot'
    })
  });
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 14,
    message_thread_id: 1,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '/start'
  } }));
  assert.equal((await result.json()).status, 'redirect_sent');
  const sends = calls.filter(call => call.method === 'sendMessage');
  assert.equal(sends.length, 2);
  assert.ok(sends[0].payload.ephemeral_message_parameters);
  assert.ok(!sends[1].payload.ephemeral_message_parameters);
  assert.equal(sends[1].payload.reply_to_message_id, 14);
});

test('external groups ignore unrelated numeric messages and never delete them', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 13,
    from: { id: 999 },
    chat: { id: -1009999999999, type: 'supergroup' },
    text: '500'
  } }));
  assert.equal((await result.json()).status, 'ignored_external_group_message');
  assert.equal(harness.calls.length, 0);
});

test('custom amount callback uses ForceReply with bank and panel context', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-custom',
    from: { id: PRIVATE_CHAT_ID },
    message: {
      message_id: 77,
      chat: { id: PRIVATE_CHAT_ID, type: 'private' },
      text: 'amounts',
      reply_to_message: { message_id: 70, from: { id: PRIVATE_CHAT_ID } }
    },
    data: addCallbackOwner('custom:bancamiga', PRIVATE_CHAT_ID)
  } }));
  const prompt = harness.calls.find(call => call.method === 'sendMessage');
  assert.equal(prompt.payload.reply_markup.force_reply, true);
  assert.equal(prompt.payload.reply_markup.selective, true);
  assert.equal(prompt.payload.reply_to_message_id, 70);
  assert.match(prompt.payload.text, new RegExp(`CF-MONTO:bancamiga:77:${PRIVATE_CHAT_ID}`));
});

test('valid custom amount in the official topic edits result and cleans only reply/prompt', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 90,
    message_thread_id: BOT_THREAD_ID,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '375',
    reply_to_message: {
      message_id: 89,
      from: { is_bot: true, username: 'calcuflowbot' },
      text: formatCustomAmountPrompt('bbva-provincial', 77, PRIVATE_CHAT_ID)
    }
  } }));
  assert.equal((await result.json()).status, 'custom_calc_sent');
  const edit = harness.calls.find(call => call.method === 'editMessageText');
  assert.equal(edit.payload.message_id, 77);
  assert.match(edit.payload.text, /BBVA Provincial/);
  const deletions = harness.calls.filter(call => call.method === 'deleteMessage').map(call => call.payload.message_id);
  assert.deepEqual(deletions, [90, 89]);
});

test('a different user cannot satisfy or clean up the owner custom-amount prompt', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 190,
    message_thread_id: BOT_THREAD_ID,
    from: { id: SECOND_USER_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '500',
    reply_to_message: {
      message_id: 189,
      from: { is_bot: true, username: 'calcuflowbot' },
      text: formatCustomAmountPrompt('bdv-fisica', 177, PRIVATE_CHAT_ID)
    }
  } }));
  assert.equal((await result.json()).status, 'ignored_custom_reply_wrong_user');
  assert.equal(harness.calls.filter(call => call.method === 'editMessageText').length, 0);
  assert.equal(harness.calls.filter(call => call.method === 'deleteMessage').length, 0);
});

test('delete permission failures do not break a custom calculation', async () => {
  const harness = createHarness({ failMethods: ['deleteMessage'] });
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 91,
    message_thread_id: BOT_THREAD_ID,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '250',
    reply_to_message: {
      message_id: 89,
      from: { is_bot: true },
      text: formatCustomAmountPrompt('bnc', 77, PRIVATE_CHAT_ID)
    }
  } }));
  assert.equal((await result.json()).status, 'custom_calc_sent');
  assert.equal(harness.calls.filter(call => call.method === 'deleteMessage').length, 2);
});

test('private custom replies are never deleted', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  await handler.fetch(webhookRequest({ message: {
    message_id: 92,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: PRIVATE_CHAT_ID, type: 'private' },
    text: '100',
    reply_to_message: { message_id: 89, from: { is_bot: true }, text: formatCustomAmountPrompt('bdv-fisica', 77, PRIVATE_CHAT_ID) }
  } }));
  assert.equal(harness.calls.filter(call => call.method === 'deleteMessage').length, 0);
});

test('result presentation uses web bank-margin parity, the derived bank rate, and green USDT emoji', () => {
  assert.equal(TELEGRAM_BANK_MARGIN, 0.5);
  assert.equal(currentBankRate(755.1552, TELEGRAM_BANK_MARGIN), 755.1552 * 1.005);
  const result = calculateValues({
    requestedUsd: 42,
    bcvRate: 755.1552,
    bankMargin: TELEGRAM_BANK_MARGIN,
    p2pRate: 937.81,
    cardFee: 2.5,
    bpayFee: 4.1
  });
  const text = formatAppCalculationResult(
    result,
    { id: 'bdv-fisica', name: 'Banco de Venezuela', fee: 2.5 },
    { bankMargin: TELEGRAM_BANK_MARGIN }
  );
  assert.match(text, /Bolívares necesarios/);
  assert.match(text, /Monto en BPay/);
  assert.match(text, /🟢 \*USDT finales\*/);
  assert.ok(!text.includes('🪙 *USDT finales*'));
  assert.match(text, /Ganancia estimada/);
  assert.match(text, /BCV: 755,16 Bs/);
  assert.match(text, /Tasa banco \(\+0,5%\): 758,93 Bs/);
  assert.match(text, /P2P: 937,81 Bs/);
  assert.ok(!text.includes(CANONICAL_APP_URL));
});

test('active Telegram calculations pass the same 0.5% bank margin as the web app', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 220,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: PRIVATE_CHAT_ID, type: 'private' },
    text: '/calc 500 bdv'
  } }));
  assert.equal((await result.json()).status, 'calc_sent');
  const text = harness.calls.find(call => call.method === 'sendMessage').payload.text;
  assert.match(text, /BCV: 68,50 Bs/);
  assert.match(text, /Tasa banco \(\+0,5%\): 68,84 Bs/);
  assert.ok(!text.includes('Tasa banco (+0,5%): 68,50 Bs'));
});

test('support menu exposes the four v2 presets plus a custom amount and removes the old 25-Star option', () => {
  assert.deepEqual(SUPPORT_AMOUNTS, [50, 100, 250, 500]);
  assert.equal(SUPPORT_PAYLOAD_PREFIX, 'calcuflow_support:v2:');
  assert.match(formatSupportMessage(), /confirmas que leíste los Términos/);
  const callbacks = buildSupportInlineKeyboard().inline_keyboard.flat().map(button => button.callback_data).filter(Boolean);
  assert.deepEqual(callbacks.filter(data => data.startsWith('stars:')), ['stars:50', 'stars:100', 'stars:250', 'stars:500']);
  assert.ok(callbacks.includes('stars-custom'));
  assert.ok(!buildSupportInlineKeyboard().inline_keyboard.flat().some(button => button.text === '⭐ 25'));
  for (const amount of SUPPORT_AMOUNTS) {
    assert.deepEqual(parseSupportPayload(buildSupportPayload(amount)), { amount, custom: false });
    assert.deepEqual(parseAppCallbackData(`stars:${amount}`), { type: 'support_invoice', amount });
  }
  assert.equal(parseSupportPayload('calcuflow_support:v1:50'), null);
  assert.equal(parseSupportPayload(`${SUPPORT_PAYLOAD_PREFIX}25`), null);
  assert.deepEqual(parseAppCallbackData('stars:25'), { type: 'invalid_support' });
  assert.deepEqual(parseAppCallbackData('stars-custom'), { type: 'custom_support_amount' });
});

test('custom Star amounts accept only safe integers in the CalcuFlow 10-5000 range', () => {
  assert.equal(MIN_SUPPORT_AMOUNT, 10);
  assert.equal(MAX_SUPPORT_AMOUNT, 5000);
  for (const amount of [10, 750, 5000]) {
    assert.deepEqual(parseSupportAmount(String(amount)), { ok: true, amount });
    const payload = buildSupportPayload(amount, { custom: true });
    assert.equal(payload, `${SUPPORT_PAYLOAD_PREFIX}custom:${amount}`);
    assert.deepEqual(parseSupportPayload(payload), { amount, custom: true });
  }
  for (const invalid of ['9', '5001', '0', '-1', '10.5', 'abc', '12 stars', 'NaN', '']) {
    assert.equal(parseSupportAmount(invalid).ok, false, invalid);
  }
  for (const malformed of [
    `${SUPPORT_PAYLOAD_PREFIX}custom:9`,
    `${SUPPORT_PAYLOAD_PREFIX}custom:5001`,
    `${SUPPORT_PAYLOAD_PREFIX}custom:10.5`,
    `${SUPPORT_PAYLOAD_PREFIX}custom:-10`,
    `${SUPPORT_PAYLOAD_PREFIX}custom:0750`
  ]) {
    assert.equal(parseSupportPayload(malformed), null, malformed);
  }
});

test('custom Star ForceReply is stateless and tied to the initiating private user', () => {
  const prompt = formatCustomSupportPrompt(PRIVATE_CHAT_ID);
  const parsed = parseCustomSupportReply({
    text: '750',
    reply_to_message: { message_id: 402, from: { is_bot: true }, text: prompt }
  });
  assert.deepEqual(parsed, {
    promptMessageId: 402,
    ok: true,
    amount: 750,
    ownerId: String(PRIVATE_CHAT_ID)
  });
  assert.equal(parseCustomSupportReply({ text: '750' }), null);
  assert.equal(parseCustomSupportReply({
    text: '750',
    reply_to_message: { message_id: 402, from: { is_bot: false }, text: prompt }
  }), null);
});

test('custom Star callback prompts privately and a valid reply creates the exact v2 XTR invoice', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const prompted = await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-custom-stars',
    from: { id: PRIVATE_CHAT_ID },
    message: { message_id: 401, chat: { id: PRIVATE_CHAT_ID, type: 'private' } },
    data: addCallbackOwner('stars-custom', PRIVATE_CHAT_ID)
  } }));
  assert.equal((await prompted.json()).status, 'custom_support_prompt_sent');
  const promptCall = harness.calls.find(call => call.method === 'sendMessage');
  assert.equal(promptCall.payload.reply_markup.force_reply, true);
  assert.equal(promptCall.payload.reply_markup.selective, true);
  assert.match(promptCall.payload.text, new RegExp(`CF-STARS:${PRIVATE_CHAT_ID}`));

  const invoiced = await handler.fetch(webhookRequest({ message: {
    message_id: 403,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: PRIVATE_CHAT_ID, type: 'private' },
    text: '750',
    reply_to_message: {
      message_id: 402,
      from: { is_bot: true },
      text: formatCustomSupportPrompt(PRIVATE_CHAT_ID)
    }
  } }));
  assert.equal((await invoiced.json()).status, 'custom_support_invoice_sent');
  const invoice = harness.calls.find(call => call.method === 'sendInvoice');
  assert.equal(invoice.payload.payload, `${SUPPORT_PAYLOAD_PREFIX}custom:750`);
  assert.equal(invoice.payload.prices[0].amount, 750);
});

test('invalid custom Star reply returns a ForceReply retry without creating an invoice', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 410,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: PRIVATE_CHAT_ID, type: 'private' },
    text: '10.5',
    reply_to_message: {
      message_id: 409,
      from: { is_bot: true },
      text: formatCustomSupportPrompt(PRIVATE_CHAT_ID)
    }
  } }));
  assert.equal((await result.json()).status, 'custom_support_invalid');
  assert.equal(harness.calls.filter(call => call.method === 'sendInvoice').length, 0);
  const retry = harness.calls.find(call => call.method === 'sendMessage');
  assert.match(retry.payload.text, /Ingresa una cantidad válida de Stars/);
  assert.equal(retry.payload.reply_markup.force_reply, true);
});

test('Stars invoice uses XTR, one price, and no provider, tip, or personal-data fields', async () => {
  const harness = createHarness();
  await sendTelegramInvoice({
    fetchImpl: harness.fetchImpl,
    botToken: 'test_token',
    chatId: PRIVATE_CHAT_ID,
    title: 'Apoyo a CalcuFlow',
    description: 'Apoyo voluntario',
    payload: `${SUPPORT_PAYLOAD_PREFIX}custom:750`,
    amount: 750
  });
  const payload = harness.calls[0].payload;
  assert.equal(payload.currency, 'XTR');
  assert.equal(payload.prices.length, 1);
  assert.equal(payload.prices[0].amount, 750);
  assert.ok(!('provider_token' in payload));
  assert.ok(!('max_tip_amount' in payload));
  assert.ok(!('suggested_tip_amounts' in payload));
  assert.ok(!('need_name' in payload));
  assert.ok(!('need_email' in payload));
  assert.ok(!('need_phone_number' in payload));
  assert.ok(!('need_shipping_address' in payload));
});

test('all four support callbacks create whitelisted private invoices', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  for (const amount of SUPPORT_AMOUNTS) {
    const result = await handler.fetch(webhookRequest({ callback_query: {
      id: `cb-stars-${amount}`,
      from: { id: PRIVATE_CHAT_ID },
      message: { message_id: 100 + amount, chat: { id: PRIVATE_CHAT_ID, type: 'private' } },
      data: `stars:${amount}`
    } }));
    assert.equal((await result.json()).status, 'invoice_sent');
  }
  const invoices = harness.calls.filter(call => call.method === 'sendInvoice');
  assert.deepEqual(invoices.map(call => call.payload.prices[0].amount), SUPPORT_AMOUNTS);
});

test('pre-checkout validation approves only matching XTR payloads and totals', async () => {
  assert.deepEqual(validatePreCheckoutQuery({
    invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}50`, currency: 'XTR', total_amount: 50
  }), { ok: true, amount: 50, custom: false });
  assert.deepEqual(validatePreCheckoutQuery({
    invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}custom:750`, currency: 'XTR', total_amount: 750
  }), { ok: true, amount: 750, custom: true });
  assert.equal(validatePreCheckoutQuery({ invoice_payload: 'other', currency: 'XTR', total_amount: 50 }).ok, false);
  assert.equal(validatePreCheckoutQuery({ invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}50`, currency: 'USD', total_amount: 50 }).ok, false);
  assert.equal(validatePreCheckoutQuery({ invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}50`, currency: 'XTR', total_amount: 100 }).ok, false);
  assert.equal(validatePreCheckoutQuery({ invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}custom:750`, currency: 'USD', total_amount: 750 }).ok, false);
  assert.equal(validatePreCheckoutQuery({ invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}custom:750`, currency: 'XTR', total_amount: 751 }).ok, false);
  assert.equal(validatePreCheckoutQuery({ invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}custom:9`, currency: 'XTR', total_amount: 9 }).ok, false);
  assert.equal(validatePreCheckoutQuery({ invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}custom:5001`, currency: 'XTR', total_amount: 5001 }).ok, false);
  assert.equal(validatePreCheckoutQuery({ invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}custom:abc`, currency: 'XTR', total_amount: 50 }).ok, false);

  const harness = createHarness();
  const handler = createHandler(harness);
  const approved = await handler.fetch(webhookRequest({ pre_checkout_query: {
    id: 'pre-1', invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}50`, currency: 'XTR', total_amount: 50
  } }));
  assert.equal((await approved.json()).status, 'pre_checkout_approved');
  assert.equal(harness.calls.find(call => call.method === 'answerPreCheckoutQuery').payload.ok, true);
  assert.equal(harness.calls.filter(call => call.method === 'sendMessage').length, 0);
});

test('successful_payment alone triggers thanks and creates no entitlement', async () => {
  const validPayment = {
    invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}100`, currency: 'XTR', total_amount: 100,
    telegram_payment_charge_id: 'not-logged-or-stored'
  };
  assert.equal(validateSuccessfulPayment(validPayment), true);
  assert.equal(validateSuccessfulPayment({ ...validPayment, currency: 'USD' }), false);
  assert.equal(validateSuccessfulPayment({
    invoice_payload: `${SUPPORT_PAYLOAD_PREFIX}custom:750`, currency: 'XTR', total_amount: 750
  }), true);
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 200,
    chat: { id: PRIVATE_CHAT_ID, type: 'private' },
    successful_payment: validPayment
  } }));
  assert.equal((await result.json()).status, 'payment_thanks_sent');
  const send = harness.calls.find(call => call.method === 'sendMessage');
  assert.match(send.payload.text, /Gracias por apoyar CalcuFlow/);
  assert.ok(!JSON.stringify(harness.calls).includes('not-logged-or-stored'));
});

test('invoice API failures are handled without exposing the bot token', async () => {
  const harness = createHarness({ failMethods: ['sendInvoice'] });
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ callback_query: {
    id: 'cb-stars-fail',
    from: { id: PRIVATE_CHAT_ID },
    message: { message_id: 300, chat: { id: PRIVATE_CHAT_ID, type: 'private' } },
    data: 'stars:50'
  } }));
  const body = await result.text();
  assert.match(body, /invoice_error/);
  assert.ok(!body.includes('test_token'));
});

test('terms and /paysupport stay accessible without claiming a support team exists', async () => {
  const terms = formatTermsMessage();
  const unavailable = formatPaymentSupportMessage();
  assert.match(terms, /\/paysupport/);
  assert.match(terms, /permanece gratuito/);
  assert.match(terms, /No es una inversión/);
  assert.doesNotMatch(`${terms}\n${unavailable}`, /equipo de (?:CalcuFlow|soporte)|support team/i);
  assert.match(unavailable, /no hay un canal de contacto/i);

  const noContactKeyboard = buildPaymentSupportInlineKeyboard();
  assert.ok(!JSON.stringify(noContactKeyboard).includes('"url"'));
  const contactKeyboard = buildPaymentSupportInlineKeyboard({ paymentSupportUrl: 'https://example.test/payment-help' });
  assert.equal(contactKeyboard.inline_keyboard[0][0].url, 'https://example.test/payment-help');

  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 420,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: PRIVATE_CHAT_ID, type: 'private' },
    text: '/paysupport'
  } }));
  assert.equal((await result.json()).status, 'payment_support_sent');
  assert.match(harness.calls.find(call => call.method === 'sendMessage').payload.text, /Problemas con un aporte de Stars/);
});

test('group support action routes to private chat and never creates a public invoice', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);
  const result = await handler.fetch(webhookRequest({ message: {
    message_id: 430,
    message_thread_id: BOT_THREAD_ID,
    from: { id: PRIVATE_CHAT_ID },
    chat: { id: OFFICIAL_CHAT_ID, type: 'supergroup' },
    text: '/apoyar@calcuflowbot'
  } }));
  assert.ok(['ephemeral_support_redirect', 'support_redirect_sent'].includes((await result.json()).status));
  assert.equal(harness.calls.filter(call => call.method === 'sendInvoice').length, 0);
  assert.match(JSON.stringify(harness.calls), /https:\/\/t\.me\/calcuflowbot\?start=support/);
});
