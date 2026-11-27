import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog } from '../audit/audit-log.js';
import { StoredLinkStatus } from '../common/link/link-state.js';
import { Domain } from '../database/entities/domain.entity.js';
import { Link } from '../database/entities/link.entity.js';
import type { Principal } from '../identity/principal.js';
import { LinkCacheInvalidator } from '../link-cache/link-cache-invalidator.js';
import { adminActor, notFound } from './admin-audit.js';

export interface AdminLinkView {
  id: string;
  status: StoredLinkStatus;
}

interface StatusChange {
  link: Link;
  hostname: string;
  changed: boolean;
}

/** Takes abusive links down, and puts them back (PRD section 13). */
@Injectable()
export class AdminLinksService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: LinkCacheInvalidator,
    private readonly audit: AuditLog,
  ) {}

  /** A blocked link answers `410`, and its workspace cannot undo that. */
  block(admin: Principal, linkId: string): Promise<AdminLinkView> {
    return this.changeStatus(admin, linkId, 'link.blocked', (current) =>
      current === StoredLinkStatus.Blocked ? null : StoredLinkStatus.Blocked,
    );
  }

  /**
   * Returns a blocked link to service. A link that is not blocked is left
   * alone, so unblocking can never re-enable a link its workspace disabled.
   */
  unblock(admin: Principal, linkId: string): Promise<AdminLinkView> {
    return this.changeStatus(admin, linkId, 'link.unblocked', (current) =>
      current === StoredLinkStatus.Blocked ? StoredLinkStatus.Active : null,
    );
  }

  private async changeStatus(
    admin: Principal,
    linkId: string,
    action: string,
    nextStatus: (current: StoredLinkStatus) => StoredLinkStatus | null,
  ): Promise<AdminLinkView> {
    const { link, hostname, changed } = await this.applyStatus(
      linkId,
      nextStatus,
    );
    if (changed) {
      // After the commit, so a reader cannot cache the row it replaced.
      await this.cache.invalidateLink(hostname, link.code);
      await this.audit.record({
        workspaceId: link.workspaceId,
        actor: adminActor(admin),
        action,
        target: { type: 'link', id: link.id },
        metadata: { hostname, code: link.code },
      });
    }
    return { id: link.id, status: link.status };
  }

  private applyStatus(
    linkId: string,
    nextStatus: (current: StoredLinkStatus) => StoredLinkStatus | null,
  ): Promise<StatusChange> {
    return this.dataSource.transaction(async (manager) => {
      // Locked, so a concurrent edit by the workspace cannot interleave.
      const link = await manager.findOne(Link, {
        where: { id: linkId },
        lock: { mode: 'pessimistic_write' },
      });
      if (link === null) {
        throw notFound('Link');
      }
      const domain = await manager.findOneByOrFail(Domain, {
        id: link.domainId,
      });
      const status = nextStatus(link.status);
      if (status === null) {
        return { link, hostname: domain.hostname, changed: false };
      }
      link.status = status;
      await manager.save(link);
      return { link, hostname: domain.hostname, changed: true };
    });
  }
}
