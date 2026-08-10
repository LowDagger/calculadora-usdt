import {
  createSupabasePushStore,
  emptyResponse,
  errorResponse,
  methodNotAllowed,
  readJsonBody,
  validatePushUnsubscribe
} from './_shared.mjs';

export function createUnsubscribeHandler({ store } = {}) {
  return {
    async fetch(request) {
      if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
      try {
        const { endpoint } = validatePushUnsubscribe(await readJsonBody(request));
        const persistence = store || createSupabasePushStore();
        await persistence.remove(endpoint);
        return emptyResponse();
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

export default createUnsubscribeHandler();
