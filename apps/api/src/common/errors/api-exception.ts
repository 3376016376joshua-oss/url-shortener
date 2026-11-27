import { STATUS_CODES } from 'node:http';
import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@url-shortener/contracts';

/** The one way to fail a request: produces the error body the API promises. */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string) {
    const body: ApiErrorBody = {
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      code,
      message,
    };
    super(body, status);
  }
}
