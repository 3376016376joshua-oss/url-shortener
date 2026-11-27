import type { EntityManager } from 'typeorm';
import { Workspace } from '../database/entities/workspace.entity.js';
import { notFound } from './workspace-errors.js';

/**
 * Locks the workspace row for the rest of the transaction. Everything that
 * counts before it writes (the last-owner rule, the member and API key
 * quotas) takes this lock first, so two requests cannot both pass a check
 * that only one of them should.
 */
export async function lockWorkspace(
  manager: EntityManager,
  workspaceId: string,
): Promise<Workspace> {
  const workspace = await manager.getRepository(Workspace).findOne({
    where: { id: workspaceId },
    lock: { mode: 'pessimistic_write' },
  });
  if (workspace === null) {
    throw notFound('Workspace');
  }
  return workspace;
}
