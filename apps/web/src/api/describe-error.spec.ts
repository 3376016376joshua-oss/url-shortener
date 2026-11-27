import type { ErrorCode } from '@url-shortener/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from './api-error.js';
import { describeError } from './describe-error.js';

function apiError(
  status: number,
  code: ErrorCode,
  retryAfterSeconds: number | null = null,
): ApiError {
  return new ApiError({
    status,
    code,
    message: 'The code "launch" is already in use',
    requestId: 'req-7',
    retryAfterSeconds,
  });
}

describe('describeError', () => {
  it("passes on the API's own message for a client error, with the request id", () => {
    expect(describeError(apiError(409, 'CODE_TAKEN'))).toEqual({
      message: 'The code "launch" is already in use',
      requestId: 'req-7',
    });
  });

  it('says when to try again after a rate limit', () => {
    expect(describeError(apiError(429, 'RATE_LIMITED', 30)).message).toBe(
      'Too many requests. Try again in 30 seconds.',
    );
    expect(describeError(apiError(429, 'RATE_LIMITED', 1)).message).toBe(
      'Too many requests. Try again in 1 second.',
    );
    expect(describeError(apiError(429, 'RATE_LIMITED')).message).toBe(
      'Too many requests. Try again in a moment.',
    );
  });

  it('never shows a server fault in the words of the server', () => {
    expect(describeError(apiError(503, 'SERVICE_UNAVAILABLE'))).toEqual({
      message: 'The service is temporarily unavailable. Try again in a moment.',
      requestId: 'req-7',
    });
  });

  it('blames the connection when no response arrived', () => {
    expect(describeError(new NetworkError()).message).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
  });

  it('keeps the detail of an unexpected failure to itself', () => {
    expect(describeError(new TypeError('x is not a function'))).toEqual({
      message: 'Something went wrong. Try again.',
      requestId: null,
    });
  });
});
