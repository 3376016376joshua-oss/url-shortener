import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { DataSource, Not, type EntityManager } from 'typeorm';
import { AuditLog } from '../audit/audit-log.js';
import { ApiException } from '../common/errors/api-exception.js';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import type { Principal } from '../identity/principal.js';
import { LinkCacheInvalidator } from '../link-cache/link-cache-invalidator.js';
import { adminActor, notFound } from './admin-audit.js';

export interface AdminDomainView {
  id: string;
  hostname: string;
  status: DomainStatus;
}

type Transition = (manager: EntityManager, domain: Domain) => Promise<boolean>;

function conflict(message: string): ApiException {
  return new ApiException(HttpStatus.CONFLICT, ErrorCode.Conflict, message);
}

/** Takes abusive custom domains down, and releases them (PRD section 13). */
@Injectable()
export class AdminDomainsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: LinkCacheInvalidator,
    private readonly audit: AuditLog,
  ) {}

  /**
   * Blocks the host: this claim stops serving, and because a blocked row
   * holds the host's one serving slot, no other claim can activate it.
   */
  block(admin: Principal, domainId: string): Promise<AdminDomainView> {
    return this.transition(admin, domainId, 'domain.blocked', blockDomain);
  }

  /**
   * Releases a blocked host. It returns to pending rather than active: it
   * must prove its DNS again, because the host may have changed hands.
   */
  unblock(admin: Principal, domainId: string): Promise<AdminDomainView> {
    return this.transition(admin, domainId, 'domain.unblocked', unblockDomain);
  }

  private async transition(
    admin: Principal,
    domainId: string,
    action: string,
    apply: Transition,
  ): Promise<AdminDomainView> {
    const { domain, changed } = await this.dataSource.transaction(
      async (manager) => {
        const found = await manager.findOne(Domain, {
          where: { id: domainId },
          lock: { mode: 'pessimistic_write' },
        });
        if (found === null) {
          throw notFound('Domain');
        }
        return { domain: found, changed: await apply(manager, found) };
      },
    );
    if (changed) {
      // After the commit: every link on the host starts or stops at once.
      await this.cache.invalidateDomain(domain.hostname);
      await this.audit.record({
        workspaceId: domain.workspaceId,
        actor: adminActor(admin),
        action,
        target: { type: 'domain', id: domain.id },
        metadata: { hostname: domain.hostname },
      });
    }
    return { id: domain.id, hostname: domain.hostname, status: domain.status };
  }
}

async function blockDomain(
  manager: EntityManager,
  domain: Domain,
): Promise<boolean> {
  if (domain.status === DomainStatus.Blocked) {
    return false;
  }
  if (domain.workspaceId === null) {
    throw conflict('A platform domain cannot be blocked');
  }
  // Checked here rather than left to the unique index, whose violation
  // would abort the transaction and surface as an unexplained failure.
  const serving = await manager.existsBy(Domain, {
    hostname: domain.hostname,
    status: DomainStatus.Active,
    id: Not(domain.id),
  });
  if (serving) {
    throw conflict(
      'Another claim is serving this host. Block that domain instead',
    );
  }
  domain.status = DomainStatus.Blocked;
  await manager.save(domain);
  return true;
}

async function unblockDomain(
  manager: EntityManager,
  domain: Domain,
): Promise<boolean> {
  if (domain.status !== DomainStatus.Blocked) {
    return false;
  }
  domain.status = DomainStatus.Pending;
  domain.ownershipVerified = false;
  domain.routingVerified = false;
  domain.failedChecks = 0;
  domain.verifiedAt = null;
  await manager.save(domain);
  return true;
}
