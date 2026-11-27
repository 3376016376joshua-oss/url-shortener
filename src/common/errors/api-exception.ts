import { STATUS_CODES } from 'node:http';
import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-code.js';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  code: ErrorCode;
  message: string;
}

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
