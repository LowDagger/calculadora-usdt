import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramHandler } from '../api/telegram.mjs';
import {
  BINANCE_P2P_URL,
  DOLARAPI_RATES_URL
} from '../api/rate-providers.mjs';
import {
  BCV_CURRENT_URL,
  BCV_HISTORY_URL
} from '../js/bcv-rates.js';
import {
  OFFICIAL_COMMUNITY_CHAT_ID,
  getTelegramAccessContext,
  getConfiguredThreadId
} from '../api/telegram-app-handler.mjs';
import { isValidBankSlug } from '../api/telegram-formatter.mjs';

const CONFIRMED_CHAT_ID = Number(OFFICIAL_COMMUNITY_CHAT_ID); // -1003824051698
const CONFIRMED_THREAD_ID = 555;   // 555
const INCIDENT_USER_ID = 601194849;
const SECOND_USER_ID = 987654321;
const PRIVATE_CHAT_ID = 123456789;

const fixedNow = () => new Date('2026-09-02T12:00:00.000Z');

function response(body = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function createHarness() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const urlString = String(url);
    if (urlString.includes('api.telegram.org')) {
      const method = urlString.split('/').at(-1);
      const payload = init.body ? JSON.parse(init.body) : null;
      calls.push({ method, payload });
      return response({ ok: true, result: { message_id: 999 } });
    }
    if (urlString === BCV_HISTORY_URL) {
      return response([{
        USD: 68.5,
        updated_at: '2026-09-02T03:00:00.000Z',
        effective_date: '2026-09-02',
        date: '2026-09-02'
      }]);
    }
    if (urlString === BCV_CURRENT_URL) {
      return response({
        USD: 68.5,
        updated_at: '2026-09-02T03:00:00.000Z',
        effective_date: '2026-09-02',
        date: '2026-09-02'
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
      TELEGRAM_ALLOWED_CHAT_ID: String(CONFIRMED_CHAT_ID),
      TELEGRAM_ALLOWED_THREAD_ID: String(CONFIRMED_THREAD_ID),
      TELEGRAM_BOT_USERNAME: 'calcuflowbot',
      ...env
    })
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL ROUTING GUARD TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('official group ignores legacy topic variables and allows all group contexts', () => {
  for (const env of [{}, { TELEGRAM_ALLOWED_THREAD_ID: '555' }, { TELEGRAM_ALLOWED_THREADS: `${CONFIRMED_CHAT_ID}:555` }]) {
    assert.equal(getConfiguredThreadId(CONFIRMED_CHAT_ID, env), '');
    for (const thread of [undefined, null, 1, 555, 999]) {
      assert.equal(getTelegramAccessContext({ id: CONFIRMED_CHAT_ID, type: 'supergroup' }, thread, env).allowed, true);
    }
    assert.equal(getTelegramAccessContext({ id: -1000000000000, type: 'supergroup' }, 555, env).allowed, false);
  }
});

for (const thread of [undefined, 1, 555]) {
  test(`official group command works without deleted topic routing: ${thread}`, async () => {
    const harness = createHarness();
    const res = await createHandler(harness).fetch(webhookRequest({ message: {
      message_id: 1005, message_thread_id: thread, from: { id: INCIDENT_USER_ID },
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' }, text: '/calcular@calcuflowbot'
    } }));
    assert.equal((await res.json()).status, 'banks_sent');
    const send = harness.calls.find(call => call.method === 'sendMessage');
    assert.equal(send.payload.message_thread_id, undefined);
    assert.doesNotMatch(JSON.stringify(send.payload), /3824051698\/555|tema Bots/);
  });
}

test('DELETED TOPIC: /calcular recovers without attaching thread 555', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 1010,
      message_thread_id: CONFIRMED_THREAD_ID,
      from: { id: INCIDENT_USER_ID },
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' },
      text: '/calcular'
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'banks_sent');
  const send = harness.calls.find(call => call.method === 'sendMessage');
  assert.ok(send);
  assert.equal(send.payload.message_thread_id, undefined);
  assert.match(send.payload.text, /Elige un banco/);
});

test('DELETED TOPIC: callback opens custom prompt without attaching thread 555', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    callback_query: {
      id: 'cb_bots_custom',
      from: { id: INCIDENT_USER_ID },
      message: {
        message_id: 579,
        message_thread_id: CONFIRMED_THREAD_ID,
        chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' }
      },
      data: `custom:bbva-provincial|u:${INCIDENT_USER_ID}`
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'custom_amount_prompt_sent');

  // Prompt never attaches the deleted thread ID
  const send = harness.calls.find(call => call.method === 'sendMessage');
  assert.ok(send);
  assert.equal(send.payload.message_thread_id, undefined);
  assert.match(send.payload.text, /Referencia: CF-MONTO:bbva-provincial:579:601194849/);
});

// ─────────────────────────────────────────────────────────────────────────────
// BANK REFERENCE & RECOVERY REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('BANK REGRESSION: reference bbva-provincial + amount 200 produces BBVA Provincial result', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 580,
      message_thread_id: CONFIRMED_THREAD_ID,
      from: { id: INCIDENT_USER_ID },
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' },
      text: '200',
      reply_to_message: {
        message_id: 579,
        message_thread_id: CONFIRMED_THREAD_ID,
        chat: { id: CONFIRMED_CHAT_ID },
        from: { id: 999999, is_bot: true, username: 'calcuflowbot' },
        text: '✏️ *Escribe el monto en USD*\n\nEjemplo: 375\n\nReferencia: CF-MONTO:bbva-provincial:579:601194849'
      }
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'custom_calc_sent');

  // Panel 579 was edited with the result
  const edit = harness.calls.find(call => call.method === 'editMessageText');
  assert.ok(edit, 'Expected panel message to be edited');
  assert.equal(edit.payload.message_id, 579);

  // STRICT ASSERTION: Result MUST be BBVA Provincial, NEVER Banco de Venezuela!
  assert.match(edit.payload.text, /BBVA Provincial\* · comisión 1,5%/);
  assert.doesNotMatch(edit.payload.text, /Banco de Venezuela/);

  // Reply markup points back to bbva-provincial
  assert.ok(JSON.stringify(edit.payload.reply_markup).includes('bank:bbva-provincial'));
});

test('BANK REGRESSION: reference with invalid bank slug is rejected and never falls back to BDV', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 581,
      message_thread_id: CONFIRMED_THREAD_ID,
      from: { id: INCIDENT_USER_ID },
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' },
      text: '200',
      reply_to_message: {
        message_id: 579,
        message_thread_id: CONFIRMED_THREAD_ID,
        chat: { id: CONFIRMED_CHAT_ID },
        from: { id: 999999, is_bot: true, username: 'calcuflowbot' },
        text: '✏️ *Escribe el monto en USD*\n\nEjemplo: 375\n\nReferencia: CF-MONTO:fake-bank-xyz:579:601194849'
      }
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ignored_custom_reply_invalid_bank');
  assert.equal(harness.calls.filter(c => c.method === 'editMessageText').length, 0);
  assert.equal(harness.calls.filter(c => c.method === 'sendMessage').length, 0);
});

test('isValidBankSlug validates known Venezuelan banks and percentage queries', () => {
  assert.equal(isValidBankSlug('bbva-provincial'), true);
  assert.equal(isValidBankSlug('bdv'), true);
  assert.equal(isValidBankSlug('banesco-fisica'), true);
  assert.equal(isValidBankSlug('bnc'), true);
  assert.equal(isValidBankSlug('bancamiga'), true);
  assert.equal(isValidBankSlug('banco-tesoro'), true);
  assert.equal(isValidBankSlug('bdt'), true);
  assert.equal(isValidBankSlug('1.5%'), true);
  assert.equal(isValidBankSlug('3%'), true);

  assert.equal(isValidBankSlug(''), false);
  assert.equal(isValidBankSlug('invalid-bank'), false);
  assert.equal(isValidBankSlug('chase'), false);
  assert.equal(isValidBankSlug(null), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// FORCEREPLY SAFETY TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('FORCEREPLY: response outside topic 555 is rejected', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 582,
      message_thread_id: 1, // Replied in General
      from: { id: INCIDENT_USER_ID },
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' },
      text: '200',
      reply_to_message: {
        message_id: 579,
        message_thread_id: CONFIRMED_THREAD_ID, // Prompt was in 555
        chat: { id: CONFIRMED_CHAT_ID },
        from: { id: 999999, is_bot: true, username: 'calcuflowbot' },
        text: '✏️ *Escribe el monto en USD*\n\nEjemplo: 375\n\nReferencia: CF-MONTO:bbva-provincial:579:601194849'
      }
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ignored_custom_reply_invalid_context');
  assert.equal(harness.calls.length, 0);
});

test('FORCEREPLY: prompt from different thread is rejected even if reply is in 555', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 583,
      message_thread_id: CONFIRMED_THREAD_ID,
      from: { id: INCIDENT_USER_ID },
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' },
      text: '200',
      reply_to_message: {
        message_id: 579,
        message_thread_id: 1, // Prompt was in General (thread 1)
        chat: { id: CONFIRMED_CHAT_ID },
        from: { id: 999999, is_bot: true, username: 'calcuflowbot' },
        text: '✏️ *Escribe el monto en USD*\n\nEjemplo: 375\n\nReferencia: CF-MONTO:bbva-provincial:579:601194849'
      }
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ignored_custom_reply_invalid_context');
  assert.equal(harness.calls.filter(c => c.method === 'editMessageText').length, 0);
});

test('FORCEREPLY: wrong owner reply is rejected', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 584,
      message_thread_id: CONFIRMED_THREAD_ID,
      from: { id: SECOND_USER_ID }, // Different user
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' },
      text: '200',
      reply_to_message: {
        message_id: 579,
        message_thread_id: CONFIRMED_THREAD_ID,
        chat: { id: CONFIRMED_CHAT_ID },
        from: { id: 999999, is_bot: true, username: 'calcuflowbot' },
        text: '✏️ *Escribe el monto en USD*\n\nEjemplo: 375\n\nReferencia: CF-MONTO:bbva-provincial:579:601194849'
      }
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ignored_custom_reply_wrong_user');
  assert.equal(harness.calls.filter(c => c.method === 'editMessageText').length, 0);
});

test('FORCEREPLY: malformed reference token is rejected and does not calculate', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 585,
      message_thread_id: CONFIRMED_THREAD_ID,
      from: { id: INCIDENT_USER_ID },
      chat: { id: CONFIRMED_CHAT_ID, type: 'supergroup' },
      text: '200',
      reply_to_message: {
        message_id: 579,
        message_thread_id: CONFIRMED_THREAD_ID,
        chat: { id: CONFIRMED_CHAT_ID },
        from: { id: 999999, is_bot: true, username: 'calcuflowbot' },
        text: '✏️ *Escribe el monto en USD*\n\nReferencia: CF-MONTO:malformed'
      }
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ignored_custom_reply_malformed_reference');
  assert.equal(harness.calls.filter(c => c.method === 'editMessageText').length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE CHAT REGRESSION TEST
// ─────────────────────────────────────────────────────────────────────────────

test('PRIVATE: custom amount flow remains fully supported without thread requirements', async () => {
  const harness = createHarness();
  const handler = createHandler(harness);

  const res = await handler.fetch(webhookRequest({
    message: {
      message_id: 1020,
      from: { id: PRIVATE_CHAT_ID },
      chat: { id: PRIVATE_CHAT_ID, type: 'private' },
      text: '350',
      reply_to_message: {
        message_id: 1019,
        chat: { id: PRIVATE_CHAT_ID },
        from: { id: 999999, is_bot: true, username: 'calcuflowbot' },
        text: `✏️ *Escribe el monto en USD*\n\nEjemplo: 375\n\nReferencia: CF-MONTO:bbva-provincial:1018:${PRIVATE_CHAT_ID}`
      }
    }
  }));

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'custom_calc_sent');

  const edit = harness.calls.find(call => call.method === 'editMessageText');
  assert.ok(edit);
  assert.equal(edit.payload.message_id, 1018);
  assert.match(edit.payload.text, /BBVA Provincial\* · comisión 1,5%/);
  assert.match(edit.payload.text, /350,00 USD/);
});
