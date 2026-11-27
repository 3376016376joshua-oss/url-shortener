import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { auditActor } from '../audit/audit-actor.js';
import { AuditLog } from '../audit/audit-log.js';
import { Workspace } from '../database/entities/workspace.entity.js';
import type { Principal } from '../identity/principal.js';
import { LinkCacheInvalidator } from '../link-cache/link-cache-invalidator.js';
import { lockWorkspace } from './workspace-lock.js';

/** Small enough that one batch, roll-ups included, stays a short statement. */
const LINK_BATCH_SIZE = 100;

interface RemovedLink {
  hostname: string;
  code: string;
}

/** Deletes a batch of links and reports the cache entries they leave behind. */
const DELETE_LINK_BATCH = `
  DELETE FROM "links"
   WHERE "id" IN (
     SELECT "id" FROM "links" WHERE "workspace_id" = $1 ORDER BY "id" LIMIT $2
   )
  RETURNING "code",
    (SELECT "hostname" FROM "domains" WHERE "domains"."id" = "links"."domain_id")
      AS "hostname"`;

const DELETE_DOMAINS = `
  DELETE FROM "domains" WHERE "workspace_id" = $1 RETURNING "hostname"`;

/**
 * Deletes a workspace with its links, domains, keys, and analytics (PRD
 * section 6), so that its links answer 404 straight away.
 *
 * Every cache entry is invalidated the way any other write does it: commit
 * the delete, then tombstone the key (PRD section 7). Tombstoning first
 * would let a redirect repopulate the cache from the row while it still
 * exists. Links therefore go in batches, each committed and then
 * invalidated, so a workspace with a million links is neither one giant
 * transaction nor one giant list of keys.
 */
@Injectable()
export class WorkspaceDeletionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly invalidator: LinkCacheInvalidator,
    private readonly auditLog: AuditLog,
  ) {}

  async delete(workspaceId: string, principal: Principal): Promise<void> {
    let removed: RemovedLink[];
    do {
      removed = await this.removeLinkBatch(
        this.dataSource.manager,
        workspaceId,
      );
      await this.invalidateLinks(removed);
    } while (removed.length === LINK_BATCH_SIZE);

    const leftovers = await this.dataSource.transaction((manager) =>
      this.removeWorkspace(manager, workspaceId, principal),
    );
    await this.invalidateLinks(leftovers.links);
    await Promise.all(
      leftovers.hostnames.map((hostname) =>
        this.invalidator.invalidateDomain(hostname),
      ),
    );
  }

  /**
   * The final step, with the workspace row locked so nothing new can be
   * created in it: removes whatever links appeared since the batches ran,
   * then the domains, then the workspace itself, which takes its members,
   * invitations, API keys, and audit log with it.
   */
  private async removeWorkspace(
    manager: EntityManager,
    workspaceId: string,
    principal: Principal,
  ): Promise<{ links: RemovedLink[]; hostnames: string[] }> {
    const workspace = await lockWorkspace(manager, workspaceId);
    const links: RemovedLink[] = [];
    let removed: RemovedLink[];
    do {
      removed = await this.removeLinkBatch(manager, workspaceId);
      links.push(...removed);
    } while (removed.length === LINK_BATCH_SIZE);

    const [domains] = await manager.query<
      [Array<{ hostname: string }>, number]
    >(DELETE_DOMAINS, [workspaceId]);
    await manager.getRepository(Workspace).delete({ id: workspaceId });
    // Platform-level: an entry in the workspace's own log would die with it.
    await this.auditLog.record(
      {
        workspaceId: null,
        actor: auditActor(principal),
        action: 'workspace.deleted',
        target: { type: 'workspace', id: workspaceId },
        metadata: { name: workspace.name },
      },
      manager,
    );
    return { links, hostnames: domains.map(({ hostname }) => hostname) };
  }

  private async removeLinkBatch(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<RemovedLink[]> {
    const [rows] = await manager.query<[RemovedLink[], number]>(
      DELETE_LINK_BATCH,
      [workspaceId, LINK_BATCH_SIZE],
    );
    return rows;
  }

  private async invalidateLinks(links: RemovedLink[]): Promise<void> {
    await Promise.all(
      links.map(({ hostname, code }) =>
        this.invalidator.invalidateLink(hostname, code),
      ),
    );
  }
}
