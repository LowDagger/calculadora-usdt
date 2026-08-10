import {
  createSupabasePushStore,
  emptyResponse,
  errorResponse,
  methodNotAllowed,
  readJsonBody,
  validatePushSubscription
} from './_shared.mjs';

export function createSubscribeHandler({ store } = {}) {
  return {
    async fetch(request) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      try {
        const subscription = validatePushSubscription(await readJsonBody(request));
        const persistence = store || createSupabasePushStore();
        await persistence.upsert(subscription);
        return emptyResponse();
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

export default createSubscribeHandler();
