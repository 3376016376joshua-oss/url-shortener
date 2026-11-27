import { STATUS_CODES } from 'node:http';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';
import { isDatabaseUnavailable } from '../database/database-unavailable.js';

export interface ErrorResponse {
  status: number;
  body: ApiErrorBody;
}

/** Codes for errors raised by the framework rather than by our own code. */
const FRAMEWORK_ERROR_CODES: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.ValidationFailed,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthenticated,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.CONFLICT]: ErrorCode.Conflict,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PayloadTooLarge,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RateLimited,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.ServiceUnavailable,
};

function buildBody(
  status: number,
  code: ErrorCode,
  message: string,
): ApiErrorBody {
  return {
    statusCode: status,
    error: STATUS_CODES[status] ?? 'Error',
    code,
    message,
  };
}

function fromFrameworkException(exception: HttpException): ErrorResponse {
  const status = exception.getStatus();
  const isServerFault = status >= Number(HttpStatus.INTERNAL_SERVER_ERROR);
  const fallback = isServerFault
    ? ErrorCode.InternalError
    : ErrorCode.RequestRejected;
  const code = FRAMEWORK_ERROR_CODES[status] ?? fallback;
  return { status, body: buildBody(status, code, exception.message) };
}

/**
 * Decides the response for anything a request can throw, so every error
 * leaves in the one documented shape and nothing internal leaks out.
 */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof ApiException) {
    return {
      status: exception.getStatus(),
      body: exception.getResponse() as ApiErrorBody,
    };
  }
  if (exception instanceof HttpException) {
    return fromFrameworkException(exception);
  }
  if (isDatabaseUnavailable(exception)) {
    const status = HttpStatus.SERVICE_UNAVAILABLE;
    return {
      status,
      body: buildBody(
        status,
        ErrorCode.ServiceUnavailable,
        'The service is temporarily unavailable',
      ),
    };
  }
  const status = HttpStatus.INTERNAL_SERVER_ERROR;
  return {
    status,
    body: buildBody(status, ErrorCode.InternalError, 'Internal server error'),
  };
}
