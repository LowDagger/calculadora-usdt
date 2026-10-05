import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramHandler } from '../api/telegram.mjs';
import { calculateValues, DEFAULT_BPAY_FEE } from '../js/calculator.js';
import { money } from '../js/utils.js';
import { resolveBank, formatHelpMessage } from '../api/telegram-formatter.mjs';
import { formatCustomAmountPrompt, formatAppCalculationResult } from '../api/telegram-ui.mjs';

const chat = { id: -1003824051698, type: 'supergroup' };
const alice = 101;
const bob = 202;
const now = () => new Date('2026-09-02T12:00:00.000Z');
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' }
});
const request = update => new Request('https://example.test/api/telegram', {
  method: 'POST', body: JSON.stringify(update)
});
const message = (text, user = alice, extra = {}) => ({ message: {
  message_id: 10, from: { id: user }, chat, text, ...extra
} });
function harness({ fallback = false, outage = false } = {}) {
  const calls = [];
  const panels = new Map(); // Test-only Telegram simulation, not application state.
  const deleted = new Set();
  let nextId = 1000;
  const fetchImpl = async (url, init = {}) => {
    const method = String(url).split('/').at(-1);
    const payload = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, payload });
    if (String(url).includes('api.telegram.org')) {
      if (method === 'sendMessage') {
        if (deleted.has(payload.reply_to_message_id)) return json({ ok: false, error_code: 400,
          description: 'Bad Request: message to be replied not found' }, 400);
        const panel = { ...payload, message_id: ++nextId, chat, from: { is_bot: true, username: 'calcuflowbot' } };
        panels.set(panel.message_id, panel);
        return json({ ok: true, result: panel });
      }
      if (method === 'editMessageText') {
        if (deleted.has(payload.message_id)) return json({ ok: false, error_code: 400,
          description: 'Bad Request: message to edit not found' }, 400);
        const panel = { ...panels.get(payload.message_id), ...payload };
        panels.set(payload.message_id, panel);
        return json({ ok: true, result: panel });
      }
      if (method === 'deleteMessage') throw new Error('Application must not delete messages');
      return json({ ok: true, result: true });
    }
    if (outage) return json({}, 503);
    if (method === 'history.json' || method === 'rate.json') {
      const record = { USD: 68.5, date: '2026-09-02', effective_date: '2026-09-02', updated_at: '2026-09-02T03:00:00.000Z' };
      return fallback ? json({}, 503) : json(method === 'history.json' ? [record] : record);
    }
    if (method === 'search') return fallback ? json({}, 403) : json({ code: '000000', success: true,
      data: Array.from({ length: 10 }, () => ({ adv: { price: '75.2' } })) });
    if (method === 'dolares') return json([
      { moneda: 'USD', fuente: 'oficial', promedio: 68.5, fechaActualizacion: '2026-09-01T20:00:00Z' },
      { moneda: 'USD', fuente: 'paralelo', promedio: 75.2, fechaActualizacion: '2026-09-01T21:00:00Z' }
    ]);
    throw new Error(`Unexpected simulated method ${method}`);
  };
  const create = () => createTelegramHandler({ fetchImpl, now, logger: { info() {}, error() {} },
    getEnv: () => ({ TELEGRAM_BOT_TOKEN: '999:test_token', TELEGRAM_BOT_USERNAME: 'calcuflowbot',
      TELEGRAM_ALLOWED_THREAD_ID: '555' }) });
  const post = async update => {
    const response = await create().fetch(request(update));
    return response.json();
  };
  const click = (data, user, panel) => post({ callback_query: {
    id: `cb-${calls.length}`, from: { id: user }, message: panel, data
  } });
  const last = () => panels.get(nextId);
  const telegram = () => calls.filter(call => ['sendMessage', 'editMessageText', 'deleteMessage', 'answerCallbackQuery', 'sendInvoice'].includes(call.method));
  return { calls, panels, deleted, post, click, last, telegram };
}

test('two users interleave public calculations without overwriting each other', async () => {
  const h = harness();
  assert.equal((await h.post(message('/calc 500 bdv'))).status, 'calc_sent');
  const original = h.last();
  const originalText = original.text;
  assert.equal(original.ephemeral_message_parameters, undefined);
  assert.match(JSON.stringify(original.reply_markup), /bank:bdv\|u:101/);

  assert.equal((await h.click('new', bob, original)).status, 'banks_sent');
  const bPanel = h.last();
  assert.notEqual(bPanel.message_id, original.message_id);
  assert.match(JSON.stringify(bPanel.reply_markup), /bank:bnc\|u:202/);
  await h.click('bank:bnc|u:202', bob, bPanel);
  const beforeWrong = h.telegram().length;
  assert.equal((await h.click('amount:bnc:500|u:202', alice, bPanel)).status, 'wrong_callback_owner');
  assert.equal(h.telegram().length, beforeWrong + 1);
  assert.equal(h.telegram().at(-1).method, 'answerCallbackQuery');
  assert.match(h.telegram().at(-1).payload.text, /calc@calcuflowbot/);
  await h.click('amount:bnc:500|u:202', bob, bPanel);
  assert.match(h.panels.get(bPanel.message_id).text, /BNC/);
  assert.equal(h.panels.get(original.message_id).text, originalText);

  await h.click('bank:bdv|u:101', alice, original);
  await h.click('amount:bdv:100|u:101', alice, original);
  assert.match(h.panels.get(original.message_id).text, /Compra: 100,00 USD/);
  assert.match(h.panels.get(bPanel.message_id).text, /Compra: 500,00 USD/);
  assert.ok(h.telegram().every(call => !call.payload.ephemeral_message_parameters && call.method !== 'deleteMessage'));
});

test('all group conversation and standalone numbers are ignored before providers or Telegram calls', async () => {
  const h = harness();
  for (const text of ['100', '500 bdv', '375,50', '375.50', 'tasas', 'ayuda', 'hola', '500 dólares hoy']) {
    assert.equal((await h.post(message(text))).status, 'ignored_group_conversation');
  }
  assert.equal(h.calls.length, 0);
});

test('commands, public rates and help work in General with explicit bot targeting', async () => {
  const h = harness();
  for (const text of ['/calc', '/calcular@calcuflowbot']) {
    assert.equal((await h.post(message(text, alice, { message_thread_id: 1 }))).status, 'banks_sent');
    assert.match(h.last().text, /Elige un banco/);
  }
  await h.post(message('/tasas@calcuflowbot'));
  assert.match(h.last().text, /BCV Today/);
  assert.match(h.last().text, /Binance P2P \(SELL USDT\/VES\)/);
  assert.match(h.last().text, /vigencia 2026-09-02/);
  assert.match(h.last().text, /consulta 2026-09-02T12:00:00.000Z/);
  await h.post(message('/ayuda@calcuflowbot'));
  assert.equal(h.last().text, formatHelpMessage());
  assert.match(h.last().text, /calc@calcuflowbot 500 bdv/);
  assert.ok(h.telegram().every(call => call.method !== 'deleteMessage' && !call.payload.message_thread_id && !call.payload.ephemeral_message_parameters));
});

test('old owned buttons enforce ownership; old unowned entry buttons create separate panels', async () => {
  const h = harness();
  await h.post(message('/calc 500 bdv'));
  const original = h.last();
  const originalText = original.text;
  for (const data of ['calc:100:bdv|u:101', 'bank:bdv-virtual|u:101', 'custom:bdv|u:101', 'rates|u:101', 'home|u:101']) {
    assert.equal((await h.click(data, bob, original)).status, 'wrong_callback_owner');
  }
  assert.equal((await h.click('calc:100:bdv', bob, original)).status, 'wrong_callback_owner');
  assert.equal((await h.click('banks', bob, original)).status, 'banks_sent');
  assert.notEqual(h.last().message_id, original.message_id);
  assert.equal(h.panels.get(original.message_id).text, originalText);
  assert.equal((await h.click('calc:500:bdv-virtual|u:101', alice, original)).status, 'calc_sent');
  assert.match(h.panels.get(original.message_id).text, /Banco de Venezuela/);
});

test('deleted custom panels recover; fresh invocations accept both comma and dot decimal replies', async () => {
  const h = harness();
  await h.post(message('/calc'));
  const original = h.last();
  h.deleted.add(original.message_id);
  await h.click('custom:bbva-provincial|u:101', alice, original);
  const prompt = h.last();
  const reference = prompt.text.match(/CF-MONTO:bbva-provincial:(\d+):101/);
  assert.ok(reference);
  const replacementId = Number(reference[1]);
  assert.notEqual(replacementId, original.message_id);
  assert.equal(prompt.reply_markup.force_reply, true);
  assert.equal(prompt.reply_markup.selective, true);
  assert.match(prompt.text, /tg:\/\/user\?id=101/);
  assert.match(prompt.text, /Responde a este mensaje/);
  for (const input of ['375,50', '375.50']) {
    assert.equal((await h.post(message(input, alice, { reply_to_message: prompt }))).status, 'custom_calc_sent');
    assert.match(h.panels.get(replacementId).text, /Compra: 375,50 USD/);
  }
  const beforeWrong = h.telegram().length;
  assert.equal((await h.post(message('375,50', bob, { reply_to_message: prompt }))).status, 'ignored_custom_reply_wrong_user');
  assert.equal(h.telegram().length, beforeWrong);
  assert.equal((await h.post(message('375,50'))).status, 'ignored_group_conversation');
});

test('invalid amount keeps the same bank, owner and panel reference', async () => {
  const h = harness();
  await h.post(message('/calc'));
  await h.click('custom:bnc|u:101', alice, h.last());
  const prompt = h.last();
  const reference = prompt.text.match(/CF-MONTO:[^\n]+/)[0];
  assert.equal((await h.post(message('texto', alice, { reply_to_message: prompt }))).status, 'custom_amount_invalid');
  assert.ok(h.last().text.includes(reference));
  assert.equal(h.last().reply_markup.force_reply, true);
  assert.match(h.last().text, /BNC/);
});

test('deleted initiating command and queued reply to a deleted prompt recover without deleting messages', async () => {
  const h = harness();
  await h.post(message('/calc'));
  const panel = { ...h.last(), reply_to_message: { message_id: 10 } };
  h.deleted.add(10);
  const before = h.telegram().length;
  assert.equal((await h.click('custom:bnc|u:101', alice, panel)).status, 'custom_amount_prompt_sent');
  const sends = h.telegram().slice(before).filter(call => call.method === 'sendMessage');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].payload.reply_to_message_id, 10);
  assert.equal(sends[1].payload.reply_to_message_id, undefined);
  assert.equal(sends[1].payload.reply_markup.force_reply, true);
  const prompt = h.last();
  h.deleted.add(prompt.message_id);
  assert.equal((await h.post(message('100', alice, { reply_to_message: prompt }))).status, 'custom_calc_sent');
  assert.match(h.panels.get(panel.message_id).text, /Compra: 100,00 USD/);
  assert.ok(h.telegram().every(call => call.method !== 'deleteMessage'));
});

test('replies to another bot cannot reuse a copied calculation or Stars reference', async () => {
  const h = harness();
  const copied = formatCustomAmountPrompt('bdv', 77, alice);
  for (const text of [copied, `Referencia: CF-STARS:${alice}`]) {
    const body = await h.post(message('375,50', alice, { reply_to_message: {
      message_id: 88, from: { id: 888, is_bot: true, username: 'otherbot' }, text
    } }));
    assert.equal(body.status, 'ignored_other_bot_reply');
  }
  assert.equal(h.calls.length, 0);
  assert.equal((await h.post(message('100', alice, { reply_to_message: {
    message_id: 88, from: { id: 999, is_bot: true }, text: copied
  } }))).status, 'custom_calc_sent');
});

test('General topic ID 1 and an omitted General ID are compatible for valid amount replies', async () => {
  const h = harness();
  const body = await h.post(message('100', alice, { reply_to_message: {
    message_id: 88, message_thread_id: 1, from: { is_bot: true, username: 'calcuflowbot' },
    text: formatCustomAmountPrompt('bdv', 77, alice)
  } }));
  assert.equal(body.status, 'custom_calc_sent');
});

test('private direct input and button navigation remain available without group restrictions', async () => {
  const h = harness();
  const privateChat = { id: alice, type: 'private' };
  assert.equal((await h.post(message('500 bdv', alice, { chat: privateChat }))).status, 'calc_sent');
  const panel = { ...h.last(), chat: privateChat };
  assert.equal((await h.click('bank:bnc|u:101', alice, panel)).status, 'amounts_sent');
  assert.equal((await h.click('amount:bnc:100|u:101', alice, panel)).status, 'calc_sent');
});

test('fallback rate presentation names DolarAPI and never labels the result as primary live data', async () => {
  const h = harness({ fallback: true });
  for (const text of ['/calc 500 bdv', '/tasas']) {
    await h.post(message(text));
    assert.match(h.last().text, /DolarAPI oficial \(respaldo\)/);
    assert.match(h.last().text, /DolarAPI paralelo \(respaldo\)/);
    assert.match(h.last().text, /2026-09-01/);
    assert.doesNotMatch(h.last().text, /BCV Today|Binance|en tiempo real/);
  }
});

test('concise result retains all financial values and units from the shared engine', () => {
  const bank = resolveBank('bdv');
  const result = calculateValues({ requestedUsd: 500, bcvRate: 68.5, p2pRate: 75.2,
    bankMargin: 0.5, cardFee: bank.fee, bankFeeSteps: bank.feeSteps, bpayFee: DEFAULT_BPAY_FEE });
  const text = formatAppCalculationResult(result, bank);
  for (const [value, unit] of [
    [result.usdUsed, 'USD'], [result.vesNeeded, 'Bs'], [result.safeGateway.bpayInputAmount, 'USD'],
    [result.usdtFinal, 'USDT'], [result.profitUsdt, 'USD'], [result.roi, '%'],
    [result.bcv, 'Bs/USD'], [result.bank, 'Bs/USD'], [result.p2p, 'Bs/USDT']
  ]) assert.ok(text.includes(`${money(value, 2)}${unit === '%' ? '' : ' '}${unit}`), `${value} ${unit}`);
});

test('repeated owned calculation callbacks edit one panel across fresh invocations', async () => {
  const h = harness();
  await h.post(message('/calc'));
  const panel = h.last();
  const update = { update_id: 1234, callback_query: { id: 'same-callback', from: { id: alice },
    message: panel, data: 'amount:bdv:500|u:101' } };
  await Promise.all([h.post(update), h.post(update)]);
  assert.equal(h.panels.size, 1);
  assert.equal(h.telegram().filter(call => call.method === 'editMessageText').length, 2);
  assert.match(h.panels.get(panel.message_id).text, /Compra: 500,00 USD/);
});

test('duplicate creating updates are explicitly not deduplicated across invocations', async () => {
  const h = harness();
  const update = { update_id: 5678, ...message('/calc 500 bdv') };
  await Promise.all([h.post(update), h.post(update)]);
  assert.equal(h.panels.size, 2); // Documented limitation; no process-local guarantee.
  assert.ok([...h.panels.values()].every(panel => /Compra: 500,00 USD/.test(panel.text)));
  const panel = h.last();
  const before = h.panels.size;
  await Promise.all([h.click('new', bob, panel), h.click('new', bob, panel)]);
  assert.equal(h.panels.size, before + 2);
  assert.match(h.panels.get(panel.message_id).text, /Compra: 500,00 USD/);
});

test('total rate-provider outage delivers an error rather than a calculation or fake rates', async () => {
  const h = harness({ outage: true });
  assert.equal((await h.post(message('/calc 500 bdv'))).status, 'calc_failed');
  assert.match(h.last().text, /No se pudieron obtener las tasas/);
  assert.doesNotMatch(h.last().text, /USDT finales|BCV Today|Binance/);
  assert.equal((await h.post(message('/tasas'))).status, 'rates_unavailable');
  assert.match(h.last().text, /No se pudieron consultar las tasas/);
  await h.post(message('/calc'));
  const panel = h.last();
  assert.equal((await h.click('amount:bnc:500|u:101', alice, panel)).status, 'calc_failed');
  assert.match(h.panels.get(panel.message_id).text, /No se pudieron obtener las tasas/);
});

test('public command outputs match the shared engine for every bank and representative amounts', async () => {
  const h = harness();
  for (const id of ['bdv', 'bbva-provincial', 'banco-tesoro', 'bancamiga', 'banesco-fisica', 'banesco-virtual', 'bnc', 'bdt']) {
    const bank = resolveBank(id);
    for (const amount of [100, 375.5, 500, 1000]) {
      const engine = calculateValues({ requestedUsd: amount, bcvRate: 68.5, p2pRate: 75.2,
        bankMargin: 0.5, cardFee: bank.fee, bankFeeSteps: bank.feeSteps, bpayFee: DEFAULT_BPAY_FEE });
      assert.equal((await h.post(message(`/calc ${amount} ${id}`))).status, 'calc_sent');
      const text = h.last().text;
      for (const [value, unit] of [[engine.usdUsed, 'USD'], [engine.vesNeeded, 'Bs'],
        [engine.safeGateway.bpayInputAmount, 'USD'], [engine.usdtFinal, 'USDT'], [engine.profitUsdt, 'USD'], [engine.roi, '%']]) {
        assert.ok(text.includes(`${money(value, 2)}${unit === '%' ? '' : ' '}${unit}`), `${id} ${amount}: ${unit}`);
      }
    }
  }
});
