import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from '../api/api-error.js';
import { shouldRetryQuery } from './query-client.js';

function apiError(status: number): ApiError {
  return new ApiError({
    status,
    code: 'REQUEST_REJECTED',
    message: 'Refused',
    requestId: null,
    retryAfterSeconds: null,
  });
}

describe('shouldRetryQuery', () => {
  it('retries a network failure and a server fault, twice at most', () => {
    expect(shouldRetryQuery(0, new NetworkError())).toBe(true);
    expect(shouldRetryQuery(1, apiError(503))).toBe(true);
    expect(shouldRetryQuery(2, apiError(503))).toBe(false);
  });

  it('never retries what would fail the same way again', () => {
    expect(shouldRetryQuery(0, apiError(404))).toBe(false);
    expect(shouldRetryQuery(0, apiError(429))).toBe(false);
    expect(shouldRetryQuery(0, new UnexpectedResponseError('GET /me'))).toBe(
      false,
    );
  });
});
