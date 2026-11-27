import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';
import type { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import type { Principal } from './principal.js';
import { requireWorkspaceRole } from './workspace-access.js';

/**
 * For the routes an API key may not call (the "Key: No" rows of PRD section
 * 14). Returns the signed-in user's id, or fails the request with 403.
 */
export function requireUserSession(principal: Principal): string {
  if (principal.kind !== 'session' || principal.userId === null) {
    throw new ApiException(
      HttpStatus.FORBIDDEN,
      ErrorCode.Forbidden,
      'This action needs a signed-in user, not an API key',
    );
  }
  return principal.userId;
}

/**
 * A signed-in user with at least `minimumRole` in the workspace. Membership
 * is checked first, so an outsider gets 404 whatever credential they hold.
 */
export function requireUserWithWorkspaceRole(
  principal: Principal,
  workspaceId: string,
  minimumRole: WorkspaceRole,
): { userId: string; role: WorkspaceRole } {
  const role = requireWorkspaceRole(principal, workspaceId, minimumRole);
  return { userId: requireUserSession(principal), role };
}
