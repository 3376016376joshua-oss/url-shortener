import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog, type AuditEntry } from '../audit/audit-log.js';
import { Domain } from '../database/entities/domain.entity.js';
import type { Link } from '../database/entities/link.entity.js';
import type { Principal } from '../identity/principal.js';
import { LinkCacheInvalidator } from '../link-cache/link-cache-invalidator.js';

export type AuditActor = AuditEntry['actor'];

export const SYSTEM_ACTOR: AuditActor = { type: 'system', id: null };

export interface LinkChange {
  actor: AuditActor;
  /** `<target>.<verb>`, for example `link.updated` or `variant.archived`. */
  action: string;
  target: AuditEntry['target'];
  /** Never a full destination URL: it can carry tokens. */
  metadata: Record<string, unknown>;
}

export function actorOf(principal: Principal): AuditActor {
  return principal.kind === 'api_key'
    ? { type: 'api_key', id: principal.apiKeyId }
    : { type: 'user', id: principal.userId };
}

/**
 * What every committed change to a link or its variants owes the rest of the
 * platform: the redirect cache is invalidated, then the change is audited.
 */
@Injectable()
export class LinkChangePublisher {
  constructor(
    private readonly dataSource: DataSource,
    private readonly invalidator: LinkCacheInvalidator,
    private readonly auditLog: AuditLog,
  ) {}

  /**
   * Call after the commit, and await it: a change that cannot be audited must
   * not report success. Invalidation goes first so that such a failure never
   * leaves a stale redirect behind as well.
   */
  async publish(link: Link, change: LinkChange): Promise<void> {
    const domain = await this.dataSource.getRepository(Domain).findOne({
      where: { id: link.domainId },
      select: { id: true, hostname: true },
    });
    if (domain !== null) {
      await this.invalidator.invalidateLink(domain.hostname, link.code);
    }
    await this.auditLog.record({
      workspaceId: link.workspaceId,
      actor: change.actor,
      action: change.action,
      target: change.target,
      metadata: change.metadata,
    });
  }
}
