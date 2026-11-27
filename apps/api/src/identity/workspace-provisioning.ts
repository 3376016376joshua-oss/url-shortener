import type { EntityManager } from 'typeorm';
import { userActor } from '../audit/audit-actor.js';
import type { AuditLog } from '../audit/audit-log.js';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../database/entities/workspace-member.entity.js';
import { Workspace } from '../database/entities/workspace.entity.js';
import { randomBase62 } from './tokens/secret-token.js';

/** The `slug` column holds 48 characters: a readable part and a random one. */
const SLUG_NAME_MAX_LENGTH = 39;
const SLUG_SUFFIX_LENGTH = 8;
const SLUG_FALLBACK_NAME = 'workspace';

/**
 * A URL-safe handle derived from the name. The random suffix, not the name,
 * is what makes it unique, so two workspaces may share a name.
 */
export function buildWorkspaceSlug(name: string, suffix: string): string {
  const readable = name
    .normalize('NFKD')
    // Drops the accents NFKD split off, so "é" reads as "e", not as a gap.
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_NAME_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
  return `${readable === '' ? SLUG_FALLBACK_NAME : readable}-${suffix}`;
}

/**
 * Creates a workspace owned by the user, inside the caller's transaction.
 * Shared by email verification (the first workspace) and `POST /workspaces`.
 */
export async function createWorkspaceWithOwner(
  manager: EntityManager,
  auditLog: AuditLog,
  name: string,
  ownerUserId: string,
): Promise<Workspace> {
  const workspace = await manager.getRepository(Workspace).save({
    name,
    slug: buildWorkspaceSlug(
      name,
      randomBase62(SLUG_SUFFIX_LENGTH).toLowerCase(),
    ),
  });
  await manager.getRepository(WorkspaceMember).insert({
    workspaceId: workspace.id,
    userId: ownerUserId,
    role: WorkspaceRole.Owner,
  });
  await auditLog.record(
    {
      workspaceId: workspace.id,
      actor: userActor(ownerUserId),
      action: 'workspace.created',
      target: { type: 'workspace', id: workspace.id },
    },
    manager,
  );
  return workspace;
}
