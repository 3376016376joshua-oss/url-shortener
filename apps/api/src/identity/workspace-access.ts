import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import type { Principal } from './principal.js';

/** Higher outranks lower: an admin may do everything a member may. */
const ROLE_RANK: Readonly<Record<WorkspaceRole, number>> = {
  [WorkspaceRole.Member]: 1,
  [WorkspaceRole.Admin]: 2,
  [WorkspaceRole.Owner]: 3,
};

/**
 * The one authorisation rule for workspace resources. Returns the caller's
 * role, or fails the request: 404 when they are not in the workspace (so its
 * existence is not revealed), 403 when their role is too low.
 */
export function requireWorkspaceRole(
  principal: Principal,
  workspaceId: string,
  minimumRole: WorkspaceRole,
): WorkspaceRole {
  const membership = principal.memberships.find(
    (candidate) => candidate.workspaceId === workspaceId,
  );
  if (membership === undefined) {
    throw new ApiException(
      HttpStatus.NOT_FOUND,
      ErrorCode.NotFound,
      'Workspace not found',
    );
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
    throw new ApiException(
      HttpStatus.FORBIDDEN,
      ErrorCode.Forbidden,
      `This action needs the ${minimumRole} role in the workspace`,
    );
  }
  return membership.role;
}
