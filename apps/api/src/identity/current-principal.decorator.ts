import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';
import type { Principal } from './principal.js';

/** The caller, on a route protected by `AuthGuard`. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const { principal } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (principal === undefined) {
      // Reaching here means the route forgot its guard: a bug, not a 401.
      throw new Error('@CurrentPrincipal() used on a route without AuthGuard');
    }
    return principal;
  },
);
