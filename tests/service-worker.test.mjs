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
      skipWaiting: async () => {},
      addEventListener: (type, handler) => { listeners[type] = handler; }
    },
    caches: {
      open: async () => cache,
      match: async () => cachedResponse,
      keys: async () => ['calcuflow-v60', 'calcuflow-v61'],
      delete: async (name) => { deletedCaches.push(name); return true; }
    },
    fetch: async () => {
      fetchCalls += 1;
      return networkResponse;
    }
  };

  vm.runInNewContext(serviceWorkerSource, context);
  return { listeners, deletedCaches, putCalls, getFetchCalls: () => fetchCalls };
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
  assert.equal(worker.getFetchCalls(), 0);
  assert.equal(worker.putCalls.length, 0);
});

test('activation deletes old versioned caches and retains the current cache', async () => {
  const worker = createWorker();
  let activation;
  worker.listeners.activate({ waitUntil: (promise) => { activation = promise; } });
  await activation;

  assert.deepEqual(worker.deletedCaches, ['calcuflow-v60']);
});
