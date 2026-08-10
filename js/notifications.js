export const NOTIFICATION_STATES = Object.freeze({
  UNSUPPORTED: 'unsupported',
  DISABLED: 'disabled',
  BLOCKED: 'blocked',
  ENABLED: 'enabled'
});

export const PUSH_CONFIG_ENDPOINT = '/api/push/config';
export const PUSH_SUBSCRIBE_ENDPOINT = '/api/push/subscribe';
export const PUSH_UNSUBSCRIBE_ENDPOINT = '/api/push/unsubscribe';

const STATE_LABELS = Object.freeze({
  [NOTIFICATION_STATES.UNSUPPORTED]: 'No compatibles',
  [NOTIFICATION_STATES.DISABLED]: 'Desactivadas',
  [NOTIFICATION_STATES.BLOCKED]: 'Bloqueadas por el navegador',
  [NOTIFICATION_STATES.ENABLED]: 'Activadas'
});

export function detectNotificationSupport({
  navigatorObject = globalThis.navigator,
  NotificationApi = globalThis.Notification,
  PushManagerApi = globalThis.PushManager
} = {}) {
  return Boolean(
    navigatorObject
    && 'serviceWorker' in navigatorObject
    && NotificationApi
    && PushManagerApi
  );
}

export function readNotificationPermission({
  navigatorObject = globalThis.navigator,
  NotificationApi = globalThis.Notification,
  PushManagerApi = globalThis.PushManager
} = {}) {
  if (!detectNotificationSupport({ navigatorObject, NotificationApi, PushManagerApi })) {
    return 'unsupported';
  }
  return ['default', 'denied', 'granted'].includes(NotificationApi.permission)
    ? NotificationApi.permission
    : 'default';
}

function stateFromPermission(permission) {
  if (permission === 'unsupported') return NOTIFICATION_STATES.UNSUPPORTED;
  if (permission === 'denied') return NOTIFICATION_STATES.BLOCKED;
  return NOTIFICATION_STATES.DISABLED;
}

async function getServiceWorkerRegistration(navigatorObject) {
  const registration = await navigatorObject.serviceWorker.ready;
  if (!registration?.pushManager) throw new Error('Service Worker no disponible.');
  return registration;
}

export async function getNotificationState(options = {}) {
  const {
    navigatorObject = globalThis.navigator,
    NotificationApi = globalThis.Notification,
    PushManagerApi = globalThis.PushManager
  } = options;
  const permission = readNotificationPermission({ navigatorObject, NotificationApi, PushManagerApi });
  if (permission !== 'granted') return stateFromPermission(permission);

  const registration = options.registration || await getServiceWorkerRegistration(navigatorObject);
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? NOTIFICATION_STATES.ENABLED : NOTIFICATION_STATES.DISABLED;
}

export function urlBase64ToUint8Array(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Clave pública de notificaciones no válida.');
  }
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = globalThis.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function serializeSubscription(subscription) {
  const serialized = subscription?.toJSON?.();
  const endpoint = serialized?.endpoint || subscription?.endpoint;
  const p256dh = serialized?.keys?.p256dh;
  const auth = serialized?.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error('El navegador devolvió una suscripción no válida.');
  return { endpoint, keys: { p256dh, auth } };
}

async function requestJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
    headers: {
      accept: 'application/json',
      ...init.headers
    }
  });
  if (!response.ok) throw new Error('El servicio de notificaciones no está disponible.');
  return response.status === 204 ? null : response.json();
}

async function saveSubscription(fetchImpl, subscription) {
  await requestJson(fetchImpl, PUSH_SUBSCRIBE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(serializeSubscription(subscription))
  });
}

export async function subscribeToPush({
  navigatorObject = globalThis.navigator,
  NotificationApi = globalThis.Notification,
  PushManagerApi = globalThis.PushManager,
  fetchImpl = globalThis.fetch,
  registration
} = {}) {
  const permission = readNotificationPermission({ navigatorObject, NotificationApi, PushManagerApi });
  if (permission === 'unsupported') return NOTIFICATION_STATES.UNSUPPORTED;
  if (permission === 'denied') return NOTIFICATION_STATES.BLOCKED;

  const config = await requestJson(fetchImpl, PUSH_CONFIG_ENDPOINT);
  if (!config || typeof config.vapidPublicKey !== 'string') {
    throw new Error('La clave pública de notificaciones no está disponible.');
  }

  const nextPermission = permission === 'granted'
    ? permission
    : await NotificationApi.requestPermission();
  if (nextPermission !== 'granted') return stateFromPermission(nextPermission);

  const activeRegistration = registration || await getServiceWorkerRegistration(navigatorObject);
  let subscription = await activeRegistration.pushManager.getSubscription();
  let createdSubscription = false;
  if (!subscription) {
    subscription = await activeRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
    });
    createdSubscription = true;
  }

  try {
    await saveSubscription(fetchImpl, subscription);
  } catch (error) {
    if (createdSubscription) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return NOTIFICATION_STATES.ENABLED;
}

export async function unsubscribeFromPush({
  navigatorObject = globalThis.navigator,
  NotificationApi = globalThis.Notification,
  PushManagerApi = globalThis.PushManager,
  fetchImpl = globalThis.fetch,
  registration
} = {}) {
  const permission = readNotificationPermission({ navigatorObject, NotificationApi, PushManagerApi });
  if (permission !== 'granted') return stateFromPermission(permission);

  const activeRegistration = registration || await getServiceWorkerRegistration(navigatorObject);
  const subscription = await activeRegistration.pushManager.getSubscription();
  if (!subscription) return NOTIFICATION_STATES.DISABLED;

  const serialized = serializeSubscription(subscription);
  await requestJson(fetchImpl, PUSH_UNSUBSCRIBE_ENDPOINT, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: serialized.endpoint })
  });

  const removed = await subscription.unsubscribe();
  if (!removed) {
    await saveSubscription(fetchImpl, subscription).catch(() => {});
    throw new Error('El navegador no pudo desactivar la suscripción.');
  }
  return NOTIFICATION_STATES.DISABLED;
}

export function createNotificationsController({
  button,
  status,
  error,
  navigatorObject = globalThis.navigator,
  NotificationApi = globalThis.Notification,
  PushManagerApi = globalThis.PushManager,
  fetchImpl = globalThis.fetch,
  documentObject = globalThis.document
}) {
  let currentState = stateFromPermission(readNotificationPermission({
    navigatorObject,
    NotificationApi,
    PushManagerApi
  }));
  let busy = false;

  function render(message = '') {
    status.textContent = STATE_LABELS[currentState];
    button.textContent = currentState === NOTIFICATION_STATES.ENABLED
      ? 'Desactivar notificaciones'
      : 'Activar notificaciones';
    button.setAttribute('aria-pressed', String(currentState === NOTIFICATION_STATES.ENABLED));
    button.disabled = busy || [NOTIFICATION_STATES.UNSUPPORTED, NOTIFICATION_STATES.BLOCKED].includes(currentState);
    error.textContent = message;
    error.hidden = !message;
  }

  async function refresh() {
    try {
      currentState = await getNotificationState({ navigatorObject, NotificationApi, PushManagerApi });
      render();
    } catch {
      currentState = stateFromPermission(readNotificationPermission({
        navigatorObject,
        NotificationApi,
        PushManagerApi
      }));
      render('No se pudo consultar el estado de las notificaciones.');
    }
    return currentState;
  }

  async function toggle() {
    if (busy) return currentState;
    busy = true;
    render();
    try {
      currentState = currentState === NOTIFICATION_STATES.ENABLED
        ? await unsubscribeFromPush({ navigatorObject, NotificationApi, PushManagerApi, fetchImpl })
        : await subscribeToPush({ navigatorObject, NotificationApi, PushManagerApi, fetchImpl });
      render();
    } catch {
      await refresh();
      render('No se pudo actualizar la suscripción. Inténtalo de nuevo.');
    } finally {
      busy = false;
      render(error.textContent);
    }
    return currentState;
  }

  function init() {
    render();
    button.addEventListener('click', toggle);
    documentObject?.addEventListener('visibilitychange', () => {
      if (documentObject.visibilityState === 'visible') refresh();
    });
    return refresh();
  }

  return { init, refresh, toggle, getState: () => currentState };
}
