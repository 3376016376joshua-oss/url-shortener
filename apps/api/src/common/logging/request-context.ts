import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `work`, and everything it starts, as part of one request. */
export function runInRequestContext<T>(
  context: RequestContext,
  work: () => T,
): T {
  return storage.run(context, work);
}

/** The id of the request being handled; `undefined` outside a request. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
