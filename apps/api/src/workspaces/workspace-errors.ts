import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';

export const notFound = (what: string): ApiException =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NotFound,
    `${what} not found`,
  );

export const forbidden = (message: string): ApiException =>
  new ApiException(HttpStatus.FORBIDDEN, ErrorCode.Forbidden, message);

export const conflict = (message: string): ApiException =>
  new ApiException(HttpStatus.CONFLICT, ErrorCode.Conflict, message);

export const quotaExceeded = (message: string): ApiException =>
  new ApiException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ErrorCode.QuotaExceeded,
    message,
  );
