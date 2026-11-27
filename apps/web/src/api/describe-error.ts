import { ApiError, NetworkError } from './api-error.js';

export interface ErrorDescription {
  /** One sentence a person can act on. */
  message: string;
  /** Present when the API answered; quoting it lets support find the request. */
  requestId: string | null;
}

const NETWORK_MESSAGE =
  'Could not reach the server. Check your connection and try again.';
const UNAVAILABLE_MESSAGE =
  'The service is temporarily unavailable. Try again in a moment.';
const UNEXPECTED_MESSAGE = 'Something went wrong. Try again.';

function rateLimitMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return 'Too many requests. Try again in a moment.';
  }
  const unit = retryAfterSeconds === 1 ? 'second' : 'seconds';
  return `Too many requests. Try again in ${String(retryAfterSeconds)} ${unit}.`;
}

/** Turns anything a query or mutation can throw into words for the person. */
export function describeError(error: unknown): ErrorDescription {
  if (error instanceof NetworkError) {
    return { message: NETWORK_MESSAGE, requestId: null };
  }
  if (!(error instanceof ApiError)) {
    return { message: UNEXPECTED_MESSAGE, requestId: null };
  }
  if (error.isRateLimited) {
    return {
      message: rateLimitMessage(error.retryAfterSeconds),
      requestId: error.requestId,
    };
  }
  if (error.isServerFault) {
    return { message: UNAVAILABLE_MESSAGE, requestId: error.requestId };
  }
  // A client error's message is written by the API for people to read.
  return { message: error.message, requestId: error.requestId };
}
