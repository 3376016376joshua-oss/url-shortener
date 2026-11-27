import { QueryClient } from '@tanstack/react-query';
import { ApiError, UnexpectedResponseError } from '../api/api-error.js';

/** A read is tried at most this many times after its first failure. */
const MAX_QUERY_RETRIES = 2;

/**
 * Retries what waiting can fix: a network failure or a server fault. A
 * client error, or a response in the wrong shape, would fail the same way.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (error instanceof UnexpectedResponseError) {
    return false;
  }
  if (error instanceof ApiError && !error.isServerFault) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryQuery },
      // A write is never repeated behind the person's back.
      mutations: { retry: false },
    },
  });
}
