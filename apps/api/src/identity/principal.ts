import type { WorkspaceRole } from '../database/entities/workspace-member.entity.js';

export interface WorkspaceMembership {
  workspaceId: string;
  role: WorkspaceRole;
}

/** Who is making an authenticated request, and what they belong to. */
export interface Principal {
  /** A signed-in user's session, or a workspace API key. */
  kind: 'session' | 'api_key';
  /** The user behind a session; `null` for an API key. */
  userId: string | null;
  /** The key behind an API-key request; `null` for a session. */
  apiKeyId: string | null;
  isPlatformAdmin: boolean;
  /**
   * Every workspace the principal may act in. An API key has exactly one,
   * with the `member` role.
   */
  memberships: ReadonlyArray<WorkspaceMembership>;
}
