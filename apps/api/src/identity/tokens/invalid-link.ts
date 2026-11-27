import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../../common/errors/api-exception.js';

/**
 * The one answer for a mailed token that cannot be used, whether it never
 * existed, has expired, or was used already: the caller learns nothing more.
 */
export function invalidLinkError(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NotFound,
    'This link is invalid or has expired',
  );
}
