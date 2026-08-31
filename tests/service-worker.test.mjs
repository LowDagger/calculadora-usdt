import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const serviceWorkerSource = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

function createWorker({ cachedResponse, networkResponse } = {}) {
  const listeners = {};
  const deletedCaches = [];
  const putCalls = [];
  let fetchCalls = 0;
  let skipWaitingCalls = 0;
  const cache = {
    addAll: async () => {},
    match: async () => cachedResponse,
    put: async (...args) => { putCalls.push(args); }
  };
  const context = {
    URL,
    Promise,
    Set,
    self: {
      location: { origin: 'https://example.com' },
      clients: { claim: async () => {} },
      skipWaiting: async () => { skipWaitingCalls += 1; },
      addEventListener: (type, handler) => { listeners[type] = handler; }
    },
    caches: {
      open: async () => cache,
      match: async () => cachedResponse,
      keys: async () => ['calcuflow-v64', 'calcuflow-v65'],
      delete: async (name) => { deletedCaches.push(name); return true; }
    },
    fetch: async () => {
      fetchCalls += 1;
      return networkResponse;
    }
  };

  vm.runInNewContext(serviceWorkerSource, context);
  return { listeners, deletedCaches, putCalls, getFetchCalls: () => fetchCalls, getSkipWaitingCalls: () => skipWaitingCalls };
}

function request(path, { mode = 'same-origin' } = {}) {
  return { method: 'GET', mode, url: `https://example.com${path}` };
}

async function dispatchFetch(worker, swRequest) {
  let responsePromise;
  worker.listeners.fetch({
    request: swRequest,
    respondWith: (promise) => { responsePromise = promise; }
  });
  return responsePromise || null;
}

test('service-worker registration configures bypass-cache and checks on visibility without timer polling', () => {
  assert.match(appSource, /updateViaCache:\s*'none'/);
  assert.match(appSource, /visibilitychange/);
  assert.match(appSource, /reg\.update\s*\(/);
  assert.doesNotMatch(appSource, /60_000/);
  assert.doesNotMatch(appSource, /setInterval\([^)]*reg\.update/);
});

test('known precached static assets are cache-first without a background fetch', async () => {
  const cached = { source: 'cache' };
  const worker = createWorker({ cachedResponse: cached, networkResponse: { source: 'network' } });

  assert.equal(await dispatchFetch(worker, request('/css/style.css')), cached);
  assert.equal(worker.getFetchCalls(), 0);
});

test('navigation remains network-first and refreshes the offline shell', async () => {
  const network = { clone: () => ({ source: 'clone' }), source: 'network' };
  const worker = createWorker({ cachedResponse: { source: 'cache' }, networkResponse: network });

  assert.equal(await dispatchFetch(worker, request('/some-page', { mode: 'navigate' })), network);
  assert.equal(worker.getFetchCalls(), 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(worker.putCalls[0][0], '/index.html');
});

test('/api/* requests remain excluded from service-worker caching', async () => {
  const worker = createWorker({ networkResponse: { source: 'network' } });

  assert.equal(await dispatchFetch(worker, request('/api/rates')), null);
  assert.equal(await dispatchFetch(worker, request('/api/config')), null);
  assert.equal(worker.getFetchCalls(), 0);
  assert.equal(worker.putCalls.length, 0);
});

test('activation deletes old versioned caches and retains the current cache', async () => {
  const worker = createWorker();
  let activation;
  worker.listeners.activate({ waitUntil: (promise) => { activation = promise; } });
  await activation;

  assert.deepEqual(worker.deletedCaches, ['calcuflow-v64']);
});

test('service-worker install caches assets without immediately calling skipWaiting', () => {
  const installBlock = serviceWorkerSource.match(/addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '';
  assert.ok(installBlock.length > 0);
  assert.doesNotMatch(installBlock, /skipWaiting/);
});

test('service-worker activates on SKIP_WAITING message', () => {
  const worker = createWorker();
  assert.equal(worker.getSkipWaitingCalls(), 0);
  worker.listeners.message({
    data: { type: 'SKIP_WAITING' }
  });
  assert.equal(worker.getSkipWaitingCalls(), 1);
});

test('service worker update flow prompts user without force-reloading active session', () => {
  assert.match(appSource, /promptUpdate/);
  assert.match(appSource, /Actualizaci[óo]n disponible - Toca para recargar/);
  assert.doesNotMatch(appSource, /newWorker\.state === 'installed' && navigator\.serviceWorker\.controller\) \{\s*activateWaiting/);
});
