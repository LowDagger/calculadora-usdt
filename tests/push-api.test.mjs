import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPushConfigHandler } from '../api/push/config.mjs';
import { createSubscribeHandler } from '../api/push/subscribe.mjs';
import { createUnsubscribeHandler } from '../api/push/unsubscribe.mjs';
import {
  MAX_PUSH_REQUEST_BYTES,
  createSupabasePushStore
} from '../api/push/_shared.mjs';

const ENDPOINT = 'https://push.example.test/send/anonymous-id';
const SUBSCRIPTION = {
  endpoint: ENDPOINT,
  keys: {
    p256dh: 'A'.repeat(87),
    auth: 'B'.repeat(22)
  }
};
const VAPID_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString('base64url');

function jsonRequest(url, method, body, headers = {}) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

test('subscribe validates and stores only endpoint and Web Push encryption keys', async () => {
  let stored;
  const handler = createSubscribeHandler({
    store: { upsert: async value => { stored = value; } }
  });
  const response = await handler.fetch(jsonRequest('https://calcuflow.test/api/push/subscribe', 'POST', SUBSCRIPTION));
  assert.equal(response.status, 204);
  assert.deepEqual(stored, {
    endpoint: ENDPOINT,
    p256dh: SUBSCRIPTION.keys.p256dh,
    auth: SUBSCRIPTION.keys.auth
  });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('subscribe rejects wrong methods, media types, unknown fields, insecure endpoints, and oversized bodies', async () => {
  const handler = createSubscribeHandler({ store: { upsert: async () => assert.fail('must not persist') } });
  const wrongMethod = await handler.fetch(new Request('https://calcuflow.test/api/push/subscribe'));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');

  const wrongType = await handler.fetch(new Request('https://calcuflow.test/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(SUBSCRIPTION)
  }));
  assert.equal(wrongType.status, 415);

  const extraField = await handler.fetch(jsonRequest('https://calcuflow.test/api/push/subscribe', 'POST', {
    ...SUBSCRIPTION,
    email: 'not-allowed@example.test'
  }));
  assert.equal(extraField.status, 400);

  const insecure = await handler.fetch(jsonRequest('https://calcuflow.test/api/push/subscribe', 'POST', {
    ...SUBSCRIPTION,
    endpoint: 'http://push.example.test/send/id'
  }));
  assert.equal(insecure.status, 400);

  const oversized = await handler.fetch(new Request('https://calcuflow.test/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(MAX_PUSH_REQUEST_BYTES) })
  }));
  assert.equal(oversized.status, 413);
});

test('unsubscribe strictly validates the endpoint-only contract', async () => {
  let removed;
  const handler = createUnsubscribeHandler({
    store: { remove: async endpoint => { removed = endpoint; } }
  });
  const response = await handler.fetch(jsonRequest(
    'https://calcuflow.test/api/push/unsubscribe',
    'DELETE',
    { endpoint: ENDPOINT }
  ));
  assert.equal(response.status, 204);
  assert.equal(removed, ENDPOINT);

  const invalid = await handler.fetch(jsonRequest(
    'https://calcuflow.test/api/push/unsubscribe',
    'DELETE',
    { endpoint: ENDPOINT, auth: 'not-allowed' }
  ));
  assert.equal(invalid.status, 400);
});

test('public config exposes only the validated VAPID public key', async () => {
  const response = await createPushConfigHandler({
    environment: { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: 'must-not-leak' }
  }).fetch(new Request('https://calcuflow.test/api/push/config'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { vapidPublicKey: VAPID_PUBLIC_KEY });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('Supabase persistence uses service-role headers server-side and never returns provider errors', async () => {
  const calls = [];
  const store = createSupabasePushStore({
    environment: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-secret'
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    },
    now: () => new Date('2026-08-10T12:00:00Z')
  });
  await store.upsert({ endpoint: ENDPOINT, p256dh: SUBSCRIPTION.keys.p256dh, auth: SUBSCRIPTION.keys.auth });
  await store.remove(ENDPOINT);

  assert.match(calls[0].url, /push_subscriptions\?on_conflict=endpoint$/);
  assert.equal(calls[0].init.headers.apikey, 'server-secret');
  assert.equal(calls[0].init.headers.authorization, 'Bearer server-secret');
  assert.match(calls[0].init.headers.prefer, /resolution=merge-duplicates/);
  assert.equal(JSON.parse(calls[0].init.body).enabled, true);
  assert.equal(calls[1].init.method, 'DELETE');
  assert.ok(!calls[1].init.body);
});

test('API failures do not expose subscription data or backend secrets', async () => {
  const secret = 'server-secret-that-must-stay-private';
  const handler = createSubscribeHandler({
    store: {
      upsert: async () => {
        throw new Error(`${secret} ${ENDPOINT}`);
      }
    }
  });
  const response = await handler.fetch(jsonRequest(
    'https://calcuflow.test/api/push/subscribe',
    'POST',
    SUBSCRIPTION
  ));
  const body = JSON.stringify(await response.json());
  assert.equal(response.status, 502);
  assert.doesNotMatch(body, new RegExp(secret));
  assert.doesNotMatch(body, /anonymous-id|p256dh|auth/);
});

test('frontend and service worker contain no privileged Supabase or private VAPID configuration', () => {
  const clientFiles = [
    '../index.html',
    '../service-worker.js',
    '../js/app.js',
    '../js/notifications.js'
  ];
  const source = clientFiles
    .map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|service-role/i);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
});
