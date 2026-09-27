import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTelegramHandler,
  sendTelegramMessage,
  TelegramApiError
} from '../api/telegram.mjs';

function telegramResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function postUpdate(handler, update) {
  return handler.fetch(new Request('https://example.com/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update)
  }));
}

for (const legacyBankId of ['bdv-fisica', 'bdv-virtual']) {
  test(`legacy ${legacyBankId} callback opens the unified BDV amount menu`, async () => {
    const calls = [];
    const handler = createTelegramHandler({
      fetchImpl: async (url, init) => {
        const method = String(url).split('/').at(-1);
        calls.push({ method, payload: JSON.parse(init.body) });
        return telegramResponse({ ok: true, result: true });
      },
      getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' })
    });

    const response = await postUpdate(handler, {
      callback_query: {
        id: `legacy-${legacyBankId}`,
        from: { id: 12345 },
        message: { message_id: 77, chat: { id: 12345, type: 'private' } },
        data: `bank:${legacyBankId}|u:12345`
      }
    });

    assert.equal((await response.json()).status, 'amounts_sent');
    const edit = calls.find(call => call.method === 'editMessageText');
    assert.match(edit.payload.text, /Banco de Venezuela/);
    assert.match(JSON.stringify(edit.payload.reply_markup), /amount:bdv:100/);
    assert.doesNotMatch(JSON.stringify(edit.payload.reply_markup), new RegExp(legacyBankId));
  });
}

test('send failure stays HTTP 200, reports an explicit status, and logs sanitized metadata', async () => {
  const logged = [];
  const token = '123456:SECRET_TOKEN_VALUE';
  const handler = createTelegramHandler({
    fetchImpl: async () => telegramResponse({
      ok: false,
      error_code: 401,
      description: `Unauthorized via https://api.telegram.org/bot${token}/sendMessage`
    }, 401),
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: token }),
    logger: { error: entry => logged.push(entry) }
  });

  const response = await postUpdate(handler, {
    message: {
      message_id: 1,
      from: { id: 12345 },
      chat: { id: 12345, type: 'private' },
      text: '/start'
    }
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'telegram_send_failed');
  assert.deepEqual(logged, [{
    event: 'telegram_api_failure',
    operation: 'send',
    method: 'sendMessage',
    errorName: 'TelegramApiError',
    httpStatus: 401,
    telegramErrorCode: 401,
    telegramDescription: 'Unauthorized via https://api.telegram.org/bot[REDACTED]/sendMessage'
  }]);
  assert.doesNotMatch(JSON.stringify(logged), new RegExp(token));
});

test('edit failure stays HTTP 200 and reports telegram_edit_failed', async () => {
  const logged = [];
  const handler = createTelegramHandler({
    fetchImpl: async url => String(url).endsWith('/answerCallbackQuery')
      ? telegramResponse({ ok: true, result: true })
      : telegramResponse({ ok: false, error_code: 400, description: 'Bad Request: message is not modified' }, 400),
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test_token' }),
    logger: { error: entry => logged.push(entry) }
  });

  const response = await postUpdate(handler, {
    callback_query: {
      id: 'edit-failure',
      from: { id: 12345 },
      message: { message_id: 77, chat: { id: 12345, type: 'private' } },
      data: 'banks|u:12345'
    }
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'telegram_edit_failed');
  assert.equal(logged.at(-1).operation, 'edit');
  assert.equal(logged.at(-1).telegramErrorCode, 400);
});

test('TelegramApiError preserves safe Telegram response diagnostics', async () => {
  await assert.rejects(
    sendTelegramMessage({
      fetchImpl: async () => telegramResponse({
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user'
      }, 403),
      botToken: 'test_token',
      chatId: 12345,
      text: 'hello'
    }),
    error => {
      assert.ok(error instanceof TelegramApiError);
      assert.equal(error.method, 'sendMessage');
      assert.equal(error.status, 403);
      assert.equal(error.errorCode, 403);
      assert.equal(error.description, 'Forbidden: bot was blocked by the user');
      assert.doesNotMatch(error.message, /test_token/);
      return true;
    }
  );
});
