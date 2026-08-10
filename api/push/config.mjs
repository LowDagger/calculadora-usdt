import {
  errorResponse,
  json,
  methodNotAllowed,
  validateVapidPublicKey
} from './_shared.mjs';

export function createPushConfigHandler({ environment = process.env } = {}) {
  return {
    async fetch(request) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      try {
        return json({
          vapidPublicKey: validateVapidPublicKey(environment.VAPID_PUBLIC_KEY)
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

export default createPushConfigHandler();
