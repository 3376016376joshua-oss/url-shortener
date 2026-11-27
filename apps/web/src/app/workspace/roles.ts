import { WORKSPACE_ROLES, type WorkspaceRole } from '../../api/session.js';

/**
 * Whether `role` may do what needs at least `minimum`. Use it to hide what a
 * member cannot use; the API still decides what is allowed.
 */
export function roleAtLeast(
  role: WorkspaceRole,
  minimum: WorkspaceRole,
): boolean {
  return WORKSPACE_ROLES.indexOf(role) >= WORKSPACE_ROLES.indexOf(minimum);
}
