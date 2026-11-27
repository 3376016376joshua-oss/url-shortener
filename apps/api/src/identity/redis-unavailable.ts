import { HttpStatus, Logger } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';

const logger = new Logger('IdentityRedis');

/**
 * The 503 for a guard that lives in Redis (sign-in lockout, mail throttle)
 * when Redis cannot answer: refusing is safer than running unguarded.
 */
export function redisGuardUnavailable(
  guard: string,
  cause: unknown,
): ApiException {
  logger.error(`${guard} unavailable, refusing the request: ${String(cause)}`);
  return new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    ErrorCode.ServiceUnavailable,
    'The service is temporarily unavailable',
  );
}
