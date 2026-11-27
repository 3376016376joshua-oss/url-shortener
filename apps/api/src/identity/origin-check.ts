import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import type { Request } from 'express';
import { ApiException } from '../common/errors/api-exception.js';

/** Methods that change nothing, and so need no cross-site protection. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The defence against cross-site request forgery (PRD section 6): a browser
 * attaches the session cookie to requests another site triggers, but it also
 * says where they came from. A state-changing request that relies on the
 * cookie must therefore name the app itself as its origin, or it is refused.
 */
export function assertSameOrigin(request: Request, appUrl: string): void {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }
  if (request.headers.origin !== appUrl) {
    throw new ApiException(
      HttpStatus.FORBIDDEN,
      ErrorCode.Forbidden,
      'Cross-site requests are not allowed',
    );
  }
}
