import {
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiException } from '../common/errors/api-exception.js';
import { ErrorCode } from '@url-shortener/contracts';
import { toErrorResponse } from './error-response.js';

describe('toErrorResponse', () => {
  it('passes an ApiException through unchanged', () => {
    const exception = new ApiException(
      HttpStatus.GONE,
      ErrorCode.LinkExpired,
      'This link has expired',
    );

    expect(toErrorResponse(exception)).toEqual({
      status: 410,
      body: {
        statusCode: 410,
        error: 'Gone',
        code: 'LINK_EXPIRED',
        message: 'This link has expired',
      },
    });
  });

  it.each([
    ['an unknown route', new NotFoundException('Cannot GET /a/b'), 'NOT_FOUND'],
    [
      'a malformed body',
      new BadRequestException('Unexpected token'),
      'VALIDATION_FAILED',
    ],
    [
      'an oversized body',
      new PayloadTooLargeException('request entity too large'),
      'PAYLOAD_TOO_LARGE',
    ],
  ])('gives %s the documented body and code', (_reason, exception, code) => {
    const { status, body } = toErrorResponse(exception);

    expect(status).toBe(exception.getStatus());
    expect(body).toEqual({
      statusCode: exception.getStatus(),
      error: expect.any(String) as string,
      code,
      message: exception.message,
    });
  });

  it('gives an unlisted client error a generic code', () => {
    const exception = new HttpException('Unsupported', 415);

    expect(toErrorResponse(exception).body).toMatchObject({
      statusCode: 415,
      error: 'Unsupported Media Type',
      code: 'REQUEST_REJECTED',
    });
  });

  it('answers 503 when the database could not be reached', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });

    expect(toErrorResponse(refused)).toEqual({
      status: 503,
      body: {
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable',
      },
    });
  });

  it('answers a generic 500 for anything else, without leaking the cause', () => {
    const { status, body } = toErrorResponse(
      new Error('relation "secrets" does not exist'),
    );

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
