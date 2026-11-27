import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';

export function linkNotFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NotFound,
    'Link not found',
  );
}

export function variantNotFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NotFound,
    'Variant not found',
  );
}

/** A workspace cannot change or delete its way out of a takedown. */
export function linkBlocked(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    ErrorCode.Conflict,
    'This link was blocked by the platform and cannot be changed or deleted',
  );
}
