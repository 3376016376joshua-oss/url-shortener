import {
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import type { Request } from 'express';
import { ApiException } from '../common/errors/api-exception.js';
import { Authenticator } from './authenticator.js';
import type { Principal } from './principal.js';

export type AuthenticatedRequest = Request & { principal?: Principal };

/**
 * Requires a signed-in user or a valid API key. Put it on every controller
 * that is not public, then read the caller with `@CurrentPrincipal()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authenticator: Authenticator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.authenticator.authenticate(request);
    if (principal === null) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.Unauthenticated,
        'Authentication is required',
      );
    }
    request.principal = principal;
    return true;
  }
}
