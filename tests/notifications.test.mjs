import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTIFICATION_STATES,
  PUSH_CONFIG_ENDPOINT,
  PUSH_SUBSCRIBE_ENDPOINT,
  PUSH_UNSUBSCRIBE_ENDPOINT,
  createNotificationsController,
  detectNotificationSupport,
  getNotificationState,
  readNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush
} from '../js/notifications.js';

const VAPID_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
const SERIALIZED_SUBSCRIPTION = {
  endpoint: 'https://push.example.test/send/anonymous-id',
  keys: {
    p256dh: 'A'.repeat(87),
    auth: 'B'.repeat(22)
  }
};

function notificationApi(permission = 'default', requestPermission = async () => 'granted') {
  return { permission, requestPermission };
}

function supportedNavigator(registration) {
  return { serviceWorker: { ready: Promise.resolve(registration) } };
}

function subscription(overrides = {}) {
  return {
    endpoint: SERIALIZED_SUBSCRIPTION.endpoint,
    toJSON: () => SERIALIZED_SUBSCRIPTION,
    unsubscribe: async () => true,
    ...overrides
  };
}

test('detects capability and maps browser permission states without requesting permission', async () => {
  const registration = { pushManager: { getSubscription: async () => null } };
  const navigatorObject = supportedNavigator(registration);
  const PushManagerApi = function PushManager() {};
  let permissionRequests = 0;
  const NotificationApi = notificationApi('default', async () => {
    permissionRequests += 1;
    return 'granted';
  });

  assert.equal(detectNotificationSupport({ navigatorObject, NotificationApi, PushManagerApi }), true);
  assert.equal(readNotificationPermission({ navigatorObject, NotificationApi, PushManagerApi }), 'default');
  assert.equal(await getNotificationState({ navigatorObject, NotificationApi, PushManagerApi }), NOTIFICATION_STATES.DISABLED);
  assert.equal(permissionRequests, 0);
  assert.equal(detectNotificationSupport({ navigatorObject: {}, NotificationApi, PushManagerApi }), false);
  assert.equal(readNotificationPermission({ navigatorObject: {}, NotificationApi, PushManagerApi }), 'unsupported');

  NotificationApi.permission = 'denied';
  assert.equal(await getNotificationState({ navigatorObject, NotificationApi, PushManagerApi }), NOTIFICATION_STATES.BLOCKED);
  NotificationApi.permission = 'granted';
  registration.pushManager.getSubscription = async () => subscription();
  assert.equal(await getNotificationState({ navigatorObject, NotificationApi, PushManagerApi }), NOTIFICATION_STATES.ENABLED);
});

test('subscribes only from the explicit enable action and persists the anonymous subscription', async () => {
  let requestPermissionCalls = 0;
  let subscribeOptions;
  const createdSubscription = subscription();
  const registration = {
    pushManager: {
      getSubscription: async () => null,
      subscribe: async (options) => {
        subscribeOptions = options;
        return createdSubscription;
      }
    }
  };
  const navigatorObject = supportedNavigator(registration);
  const NotificationApi = notificationApi('default', async () => {
    requestPermissionCalls += 1;
    return 'granted';
  });
  const PushManagerApi = function PushManager() {};
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return url === PUSH_CONFIG_ENDPOINT
      ? Response.json({ vapidPublicKey: VAPID_PUBLIC_KEY })
      : new Response(null, { status: 204 });
  };

  const listeners = new Map();
  const button = {
    disabled: false,
    textContent: '',
    setAttribute() {},
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const status = { textContent: '' };
  const error = { textContent: '', hidden: true };
  const controller = createNotificationsController({
    button,
    status,
    error,
    navigatorObject,
    NotificationApi,
    PushManagerApi,
    fetchImpl,
    documentObject: null
  });

  await controller.init();
  assert.equal(requestPermissionCalls, 0);
  assert.equal(status.textContent, 'Desactivadas');

  await listeners.get('click')();
  assert.equal(requestPermissionCalls, 1);
  assert.equal(controller.getState(), NOTIFICATION_STATES.ENABLED);
  assert.equal(subscribeOptions.userVisibleOnly, true);
  assert.ok(subscribeOptions.applicationServerKey instanceof Uint8Array);
  assert.equal(subscribeOptions.applicationServerKey.length, 65);
  assert.deepEqual(calls.map(call => call.url), [PUSH_CONFIG_ENDPOINT, PUSH_SUBSCRIBE_ENDPOINT]);
  assert.deepEqual(JSON.parse(calls[1].init.body), SERIALIZED_SUBSCRIPTION);
});

test('rolls back a newly-created browser subscription when backend persistence fails', async () => {
  let unsubscribed = false;
  const createdSubscription = subscription({
    unsubscribe: async () => {
      unsubscribed = true;
      return true;
    }
  });
  const registration = {
    pushManager: {
      getSubscription: async () => null,
      subscribe: async () => createdSubscription
    }
  };
  const fetchImpl = async (url) => url === PUSH_CONFIG_ENDPOINT
    ? Response.json({ vapidPublicKey: VAPID_PUBLIC_KEY })
    : Response.json({ error: 'unavailable' }, { status: 502 });

  await assert.rejects(() => subscribeToPush({
    navigatorObject: supportedNavigator(registration),
    NotificationApi: notificationApi('granted'),
    PushManagerApi: function PushManager() {},
    fetchImpl,
    registration
  }), /no está disponible/);
  assert.equal(unsubscribed, true);
});

test('removes the server record before cleanly unsubscribing in the browser', async () => {
  const order = [];
  const activeSubscription = subscription({
    unsubscribe: async () => {
      order.push('browser');
      return true;
    }
  });
  const registration = { pushManager: { getSubscription: async () => activeSubscription } };
  const fetchImpl = async (url, init) => {
    order.push('server');
    assert.equal(url, PUSH_UNSUBSCRIBE_ENDPOINT);
    assert.equal(init.method, 'DELETE');
    assert.deepEqual(JSON.parse(init.body), { endpoint: SERIALIZED_SUBSCRIPTION.endpoint });
    return new Response(null, { status: 204 });
  };

  const state = await unsubscribeFromPush({
    navigatorObject: supportedNavigator(registration),
    NotificationApi: notificationApi('granted'),
    PushManagerApi: function PushManager() {},
    fetchImpl,
    registration
  });
  assert.equal(state, NOTIFICATION_STATES.DISABLED);
  assert.deepEqual(order, ['server', 'browser']);
});
