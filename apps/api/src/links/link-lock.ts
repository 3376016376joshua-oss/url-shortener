import type { EntityManager } from 'typeorm';
import { StoredLinkStatus } from '../common/link/link-state.js';
import { Link } from '../database/entities/link.entity.js';
import { linkBlocked, linkNotFound } from './link-errors.js';

/**
 * Loads a link of the workspace for a change and holds its row lock until the
 * transaction ends. Every change to a link or its variants goes through here,
 * so concurrent changes run one after another, and none can overwrite a
 * takedown that lands in between.
 */
export async function lockEditableLink(
  manager: EntityManager,
  workspaceId: string,
  linkId: string,
): Promise<Link> {
  const link = await manager.findOne(Link, {
    where: { id: linkId, workspaceId },
    lock: { mode: 'pessimistic_write' },
  });
  if (link === null) {
    throw linkNotFound();
  }
  if (link.status === StoredLinkStatus.Blocked) {
    throw linkBlocked();
  }
  return link;
}
