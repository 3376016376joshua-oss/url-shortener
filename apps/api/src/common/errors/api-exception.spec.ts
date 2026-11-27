import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiException } from './api-exception.js';
import { ErrorCode } from '@url-shortener/contracts';

describe('ApiException', () => {
  it('carries the status and the documented error body', () => {
    const exception = new ApiException(
      HttpStatus.CONFLICT,
      ErrorCode.CodeTaken,
      'Alias "launch" is already in use',
    );

    expect(exception.getStatus()).toBe(409);
    expect(exception.getResponse()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      code: 'CODE_TAKEN',
      message: 'Alias "launch" is already in use',
    });
  });

  it('names the status for every code the API uses', () => {
    const statuses = [400, 401, 403, 404, 409, 410, 422, 429, 503];

    for (const status of statuses) {
      const exception = new ApiException(
        status,
        ErrorCode.ServiceUnavailable,
        'message',
      );
      const body = exception.getResponse() as { error: string };

      expect(body.error).not.toBe('Error');
    }
  });
});
