import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';

/**
 * Whether someone with `actorRole` may remove another person who has
 * `targetRole` (PRD section 6): an owner may remove anyone, an admin only
 * members. Leaving the workspace oneself is not decided here.
 */
export function mayRemoveMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): boolean {
  if (actorRole === WorkspaceRole.Owner) {
    return true;
  }
  return (
    actorRole === WorkspaceRole.Admin && targetRole === WorkspaceRole.Member
  );
}
