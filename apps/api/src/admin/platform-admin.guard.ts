import {
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';
import type { AuthenticatedRequest } from '../identity/auth.guard.js';

/**
 * Lets only a signed-in platform admin through. Use it after `AuthGuard`.
 * An API key is always refused: it acts for a workspace, never for the
 * operator.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { principal } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const isPlatformAdmin =
      principal?.kind === 'session' &&
      principal.userId !== null &&
      principal.isPlatformAdmin;
    if (!isPlatformAdmin) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        ErrorCode.Forbidden,
        'This action needs a platform admin',
      );
    }
    return true;
  }
}
