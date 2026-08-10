import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

function loadServiceWorker({ windowClients = [] } = {}) {
  const listeners = new Map();
  const shown = [];
  const opened = [];
  const self = {
    location: { origin: 'https://calcu-flow.vercel.app' },
    registration: {
      showNotification: async (title, options) => { shown.push({ title, options }); }
    },
    clients: {
      claim: async () => {},
      matchAll: async () => windowClients,
      openWindow: async url => { opened.push(url); }
    },
    skipWaiting: async () => {},
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const context = vm.createContext({
    self,
    URL,
    fetch: async () => new Response('ok'),
    caches: {
      open: async () => ({
        addAll: async () => {},
        match: async () => null,
        put: async () => {}
      }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null
    },
    Response
  });
  vm.runInContext(source, context);
  return { listeners, shown, opened };
}

test('push handler displays the supported payload with a same-origin destination', async () => {
  const { listeners, shown } = loadServiceWorker();
  let pending;
  listeners.get('push')({
    data: { json: () => ({ title: 'CalcuFlow', body: 'Tienes una actualización.', url: '/avisos?from=push' }) },
    waitUntil(promise) { pending = promise; }
  });
  await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(shown)), [{
    title: 'CalcuFlow',
    options: {
      body: 'Tienes una actualización.',
      icon: '/assets/icon.svg',
      data: { url: 'https://calcu-flow.vercel.app/avisos?from=push' }
    }
  }]);
});

test('notification clicks never open an arbitrary external URL', async () => {
  const { listeners, opened } = loadServiceWorker();
  let closed = false;
  let pending;
  listeners.get('notificationclick')({
    notification: {
      data: { url: 'https://attacker.example/phishing' },
      close() { closed = true; }
    },
    waitUntil(promise) { pending = promise; }
  });
  await pending;
  assert.equal(closed, true);
  assert.deepEqual(opened, ['https://calcu-flow.vercel.app/']);
});

test('notification clicks focus an existing CalcuFlow window when possible', async () => {
  let focused = 0;
  const existingClient = {
    url: 'https://calcu-flow.vercel.app/',
    focus: async () => { focused += 1; }
  };
  const { listeners, opened } = loadServiceWorker({ windowClients: [existingClient] });
  let pending;
  listeners.get('notificationclick')({
    notification: { data: { url: '/details' }, close() {} },
    waitUntil(promise) { pending = promise; }
  });
  await pending;
  assert.equal(focused, 1);
  assert.deepEqual(opened, []);
});

test('push additions preserve the cache strategy and keep API requests out of cache', () => {
  assert.match(source, /const APP_VERSION\s*=\s*'53'/);
  assert.match(source, /'\/js\/notifications\.js'/);
  assert.match(source, /event\.request\.method !== 'GET'/);
  assert.match(source, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(source, /requestUrl\.pathname\.startsWith\('\/api\/'\)/);

  const { listeners } = loadServiceWorker();
  let intercepted = false;
  listeners.get('fetch')({
    request: { method: 'GET', url: 'https://calcu-flow.vercel.app/api/push/config', mode: 'cors' },
    respondWith() { intercepted = true; }
  });
  assert.equal(intercepted, false);
});
