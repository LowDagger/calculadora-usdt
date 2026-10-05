import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTelegramHandler, sendTelegramMessage, editTelegramMessageText,
  answerTelegramCallbackQuery, classifyTelegramError
} from '../api/telegram.mjs';
import { formatCustomAmountPrompt } from '../api/telegram-ui.mjs';

const official = -1003824051698;
const owner = 12345;
const quiet = { info() {}, error() {} };
const response = (body = { ok: true, result: { message_id: 99 } }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const rejected = (description, status = 400, parameters) =>
  response({ ok: false, error_code: status, description, parameters }, status);
const post = (handler, update) => handler.fetch(new Request('https://example.test/api/telegram', {
  method: 'POST', body: JSON.stringify(update)
}));
const message = (text, extra = {}) => ({ message: {
  message_id: 10, from: { id: owner }, chat: { id: official, type: 'supergroup' }, text, ...extra
} });
const callback = (data = 'banks', extra = {}) => ({ callback_query: {
  id: 'cb', from: { id: owner },
  message: { message_id: 77, chat: { id: official, type: 'supergroup' }, ...extra },
  data: `${data}|u:${owner}`
} });
function harness(fetchReply, overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const payload = init?.body ? JSON.parse(init.body) : null;
    calls.push({ method, payload });
    return fetchReply(method, payload, calls.length);
  };
  const create = () => createTelegramHandler({
    fetchImpl, logger: quiet, timeoutMs: 200,
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_BOT_USERNAME: 'calcuflowbot',
      TELEGRAM_ALLOWED_THREAD_ID: '555', TELEGRAM_ALLOWED_THREADS: `${official}:555` }),
    ...overrides
  });
  return { calls, create };
}

for (const [status, body, category] of [
  [400, { description: "Bad Request: can't parse entities" }, 'formatting'],
  [400, { description: 'Bad Request: message is not modified' }, 'not_modified'],
  [400, { description: 'Bad Request: message to edit not found' }, 'missing_message'],
  [400, { description: "Bad Request: message can't be edited" }, 'missing_message'],
  [400, { description: 'Bad Request: message to be replied not found' }, 'missing_reply'],
  [400, { description: 'Bad Request: message thread not found' }, 'missing_thread'],
  [400, { description: 'Bad Request: not enough rights to send text messages to the chat' }, 'permission'],
  [403, { description: 'Forbidden: bot was blocked by the user' }, 'permission'],
  [200, { error_code: 429 }, 'rate_limited'],
  [502, {}, 'server'],
  [400, { description: 'Bad Request: unrelated invalid parameter' }, 'unknown']
]) {
  test(`classifies HTTP ${status} / Telegram ${JSON.stringify(body)} as ${category}`, () => {
    assert.equal(classifyTelegramError(status, body), category);
  });
}

test('formatting fallback preserves keyboard/reply and is only triggered by a formatting error', async () => {
  const calls = [];
  await sendTelegramMessage({ botToken: 'test-token', chatId: owner, text: '*Hola*',
    replyMarkup: { inline_keyboard: [] }, replyToMessageId: 4,
    fetchImpl: async (_, init) => {
      calls.push(JSON.parse(init.body));
      return calls.length === 1 ? rejected("Bad Request: can't parse entities") : response();
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].parse_mode, undefined);
  assert.equal(calls[1].text, 'Hola');
  assert.deepEqual(calls[1].reply_markup, calls[0].reply_markup);
  assert.equal(calls[1].reply_to_message_id, 4);
  let attempts = 0;
  await assert.rejects(sendTelegramMessage({ botToken: 'test-token', chatId: owner, text: '*Hola*',
    fetchImpl: async () => { attempts++; return rejected('Bad Request: chat not found'); }
  }), error => error.category === 'unknown');
  assert.equal(attempts, 1);
});

test('HTTP 200 with Telegram ok:false does not count as successful delivery', async () => {
  const h = harness(() => response({ ok: false, error_code: 403, description: 'Forbidden' }));
  const body = await (await post(h.create(), message('/start'))).json();
  assert.equal(body.ok, false);
  assert.equal(body.status, 'delivery_failed');
  assert.equal(body.category, 'permission');
  assert.equal(h.calls.length, 1);
});

test('unchanged edits succeed once without plain-text fallback', async () => {
  let calls = 0;
  const result = await editTelegramMessageText({ botToken: 'test-token', chatId: owner,
    messageId: 77, text: '*Hola*', fetchImpl: async () => {
      calls++; return rejected('Bad Request: message is not modified');
    }
  });
  assert.equal(result.noOp, true);
  assert.equal(calls, 1);
});

test('missing replies recover once without a reply; deleted topics recover without thread or reply', async () => {
  for (const [description, field] of [
    ['Bad Request: message to be replied not found', 'reply_to_message_id'],
    ['Bad Request: message thread not found', 'message_thread_id']
  ]) {
    const calls = [];
    await sendTelegramMessage({ botToken: 'test-token', chatId: official, text: '*Hola*',
      replyToMessageId: 9, messageThreadId: 999,
      fetchImpl: async (_, init) => {
        calls.push(JSON.parse(init.body));
        return calls.length === 1 ? rejected(description) : response();
      }
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1][field], undefined);
    assert.equal(calls[1].parse_mode, 'Markdown');
  }
});

test('missing custom panel replacement supplies the new reference across fresh invocations', async () => {
  const h = harness(method => {
    if (method === 'editMessageText') return rejected('Bad Request: message to edit not found');
    return response();
  });
  const body = await (await post(h.create(), callback('custom:bnc', { message_thread_id: 555 }))).json();
  assert.equal(body.status, 'custom_amount_prompt_sent');
  assert.equal(h.calls[0].method, 'answerCallbackQuery');
  const sends = h.calls.filter(call => call.method === 'sendMessage');
  assert.equal(sends.length, 2);
  assert.match(sends[1].payload.text, /CF-MONTO:bnc:99:12345/);
  assert.ok(sends.every(call => !call.payload.message_thread_id));
});

test('partial custom prompt failure is acknowledged without permitting a repeated panel send', async () => {
  let sends = 0;
  const h = harness(method => {
    if (method === 'editMessageText') return rejected('Bad Request: message to edit not found');
    if (method === 'sendMessage' && ++sends === 2) return rejected('Too Many Requests', 429, { retry_after: 30 });
    return response();
  });
  const res = await post(h.create(), callback('custom:bnc'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: false, status: 'partial_delivery', category: 'rate_limited', retry: false });
  assert.equal(sends, 2);
});

test('429 honors a short retry_after and retries at most three times', async () => {
  let attempts = 0;
  const started = Date.now();
  await sendTelegramMessage({ botToken: 'test-token', chatId: owner, text: 'Hola', timeoutMs: 300,
    fetchImpl: async () => ++attempts === 1 ? rejected('Too Many Requests', 429, { retry_after: 0.01 }) : response()
  });
  assert.equal(attempts, 2);
  assert.ok(Date.now() - started >= 8);
  attempts = 0;
  await assert.rejects(sendTelegramMessage({ botToken: 'test-token', chatId: owner, text: 'Hola',
    fetchImpl: async () => { attempts++; return rejected('Too Many Requests', 429, { retry_after: 0 }); }
  }), error => error.category === 'rate_limited');
  assert.equal(attempts, 3);
});

test('long retry_after returns retryable webhook failure before any required delivery', async () => {
  const h = harness(() => rejected('Too Many Requests', 429, { retry_after: 30 }));
  const res = await post(h.create(), message('/start'));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).retry, true);
  assert.equal(h.calls.length, 1);
});

for (const [category, fetchReply] of [
  ['server', () => rejected('Bad Gateway', 502)],
  ['network', () => { throw new TypeError('network error with PRIVATE_DATA'); }],
  ['timeout', () => new Promise(() => {})]
]) {
  test(`ambiguous ${category} send is attempted once and acknowledged as unknown`, async () => {
    const h = harness(fetchReply, { timeoutMs: 15 });
    const res = await post(h.create(), message('/start'));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: false, status: 'delivery_unknown', category, retry: false });
    assert.equal(h.calls.length, 1);
  });
}

test('response body timeout is bounded and never repeats sendMessage', async () => {
  let attempts = 0;
  await assert.rejects(sendTelegramMessage({ botToken: 'test-token', chatId: owner, text: 'Hola', timeoutMs: 15,
    fetchImpl: async () => { attempts++; return { ok: true, status: 200, json: () => new Promise(() => {}) }; }
  }), error => error.category === 'timeout');
  assert.equal(attempts, 1);
});

test('non-JSON HTTP 403 retains permission category without a formatting fallback', async () => {
  let attempts = 0;
  await assert.rejects(sendTelegramMessage({ botToken: 'test-token', chatId: owner, text: 'Hola',
    fetchImpl: async () => { attempts++; return new Response('Forbidden', { status: 403 }); }
  }), error => error.category === 'permission');
  assert.equal(attempts, 1);
});

test('failed callback acknowledgement does not invalidate a successful panel edit', async () => {
  const h = harness(method => method === 'answerCallbackQuery'
    ? rejected('Bad Request: query is too old and response timeout expired') : response());
  const body = await (await post(h.create(), callback())).json();
  assert.equal(body.ok, true);
  assert.equal(body.status, 'banks_sent');
  assert.deepEqual(h.calls.map(call => call.method), ['answerCallbackQuery', 'editMessageText']);
});

test('concurrent webhook invocations keep failure and completion accounting separate', async () => {
  const h = harness(async (_, payload) => {
    await new Promise(resolve => setTimeout(resolve, payload.chat_id === owner ? 5 : 10));
    return payload.chat_id === owner ? rejected('Too Many Requests', 429, { retry_after: 30 }) : response();
  });
  const handler = h.create();
  const [failed, delivered] = await Promise.all([
    post(handler, message('/start', { chat: { id: owner, type: 'private' } })),
    post(handler, message('/start', { chat: { id: owner + 1, type: 'private' } }))
  ]);
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).status, 'delivery_failed');
  assert.equal(delivered.status, 200);
  assert.equal((await delivered.json()).status, 'home_sent');
});

test('idempotent callback answers and edits recover from transient failures', async () => {
  for (const method of [answerTelegramCallbackQuery, editTelegramMessageText]) {
    let attempts = 0;
    await method({ botToken: 'test-token', callbackQueryId: 'cb', chatId: owner,
      messageId: 77, text: 'Hola', timeoutMs: 400,
      fetchImpl: async () => ++attempts === 1 ? rejected('Bad Gateway', 502) : response()
    });
    assert.equal(attempts, 2);
  }
});

test('commands addressed to other bots are ignored before diagnostics or rates', async () => {
  const h = harness(() => response());
  for (const text of ['/start@anotherbot', '/calc@anotherbot 100', '/threadid@anotherbot', '/tasas@anotherbot']) {
    assert.equal((await (await post(h.create(), message(text))).json()).status, 'ignored_other_bot_command');
  }
  assert.equal(h.calls.length, 0);
  assert.equal((await (await post(h.create(), message('/start@CalcuFlowBot'))).json()).status, 'home_sent');
});

test('unauthorized groups receive no messages, invoices, or diagnostic replies', async () => {
  const h = harness(() => response());
  for (const text of ['/start', '/threadid', '/calc 100', '/apoyar']) {
    await post(h.create(), message(text, { chat: { id: -1009999, type: 'supergroup' } }));
  }
  await post(h.create(), callback('banks', { chat: { id: -1009999, type: 'supergroup' } }));
  assert.deepEqual(h.calls.map(call => call.method), ['answerCallbackQuery']);
});

test('diagnostics omit all user text, financial amounts, names, tokens, and API descriptions', async () => {
  const logs = [];
  const h = harness(() => rejected('Forbidden: SECRET name 987.65'), {
    logger: { info: entry => logs.push(entry), error: entry => logs.push(entry) }
  });
  await post(h.create(), message('/calc 987.65', { from: { id: owner, first_name: 'PRIVATE_NAME' } }));
  const serialized = JSON.stringify(logs);
  assert.doesNotMatch(serialized, /987\.65|SECRET|PRIVATE_NAME|test-token|Forbidden/);
  assert.ok(logs.some(entry => Number.isFinite(entry.durationMs)));
});

test('fresh handler calculates custom reply without cleanup or administrator privileges', async () => {
  const h = harness(method => {
    if (method === 'deleteMessage') return rejected('Forbidden: not enough rights', 403);
    if (['sendMessage', 'editMessageText', 'answerCallbackQuery'].includes(method)) return response();
    if (method === 'history.json') return response([{ USD: 68.5, updated_at: '2026-09-02T03:00:00Z', effective_date: '2026-09-02', date: '2026-09-02' }]);
    if (method === 'rate.json') return response({ USD: 68.5, updated_at: '2026-09-02T03:00:00Z', effective_date: '2026-09-02', date: '2026-09-02' });
    if (method === 'search') return response({ code: '000000', success: true,
      data: Array.from({ length: 10 }, () => ({ adv: { price: '75.2' } })) });
    return response([]);
  }, { now: () => new Date('2026-09-02T12:00:00Z') });
  await post(h.create(), callback('custom:bnc'));
  h.calls.length = 0;
  const res = await post(h.create(), message('375', { reply_to_message: {
    message_id: 99, from: { is_bot: true, username: 'calcuflowbot' }, text: formatCustomAmountPrompt('bnc', 77, owner)
  } }));
  assert.equal((await res.json()).status, 'custom_calc_sent');
  assert.equal(h.calls.filter(call => call.method === 'editMessageText').length, 1);
  assert.equal(h.calls.filter(call => call.method === 'deleteMessage').length, 0);
});
