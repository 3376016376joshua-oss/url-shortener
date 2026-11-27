import type { EntityManager } from 'typeorm';
import { StoredLinkStatus } from '../common/link/link-state.js';
import { Domain } from '../database/entities/domain.entity.js';
import { Link } from '../database/entities/link.entity.js';
import { linkBlocked, linkNotFound } from './link-errors.js';

export interface LockedLink {
  link: Link;
  /**
   * The host the link is served on. Read here, inside the transaction, so
   * that nothing which can fail stands between the commit and the cache
   * invalidation that needs it.
   */
  hostname: string;
}

/** Locks a link's row until the transaction ends; `null` when it is gone. */
export async function lockLink(
  manager: EntityManager,
  where: { id: string; workspaceId?: string },
): Promise<LockedLink | null> {
  const link = await manager.findOne(Link, {
    where,
    lock: { mode: 'pessimistic_write' },
  });
  if (link === null) {
    return null;
  }
  const domain = await manager.findOneOrFail(Domain, {
    where: { id: link.domainId },
    select: { id: true, hostname: true },
  });
  return { link, hostname: domain.hostname };
}

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
): Promise<LockedLink> {
  const locked = await lockLink(manager, { id: linkId, workspaceId });
  if (locked === null) {
    throw linkNotFound();
  }
  if (locked.link.status === StoredLinkStatus.Blocked) {
    throw linkBlocked();
  }
  return locked;
}
