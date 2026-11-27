import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditLog } from '../audit/audit-log.js';
import { CounterName, Metrics } from '../common/metrics/metrics.js';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import { LinkCacheInvalidator } from '../link-cache/link-cache-invalidator.js';
import { SYSTEM_ACTOR, type AuditActor } from './audit-actor.js';
import { Clock } from './clock.js';
import { DnsLookupError } from './dns-resolver.js';
import {
  DomainDnsChecker,
  type DomainCheckResult,
} from './domain-dns-checker.js';
import { applyCheck, type VerificationState } from './verification-policy.js';

/** What a check changed, for the work that follows the commit. */
interface AppliedCheck {
  domain: Domain;
  previousStatus: DomainStatus;
  /** Another workspace's claim that was serving the host until this check. */
  displaced: Domain | null;
}

const DEACTIVATION_REASON = {
  DnsCheckFailed: 'dns_check_failed',
  NeverVerified: 'never_verified',
  OwnershipMoved: 'ownership_moved',
} as const;

function isServing(domain: Domain): boolean {
  return (
    domain.status === DomainStatus.Active ||
    domain.status === DomainStatus.Blocked
  );
}

/**
 * Checks a custom domain's DNS and moves it between `PENDING`, `ACTIVE`, and
 * `INACTIVE` (PRD section 8). Platform domains and blocked domains are never
 * checked: neither status is DNS's to change.
 */
@Injectable()
export class DomainVerificationService {
  private readonly logger = new Logger(DomainVerificationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly checker: DomainDnsChecker,
    private readonly clock: Clock,
    private readonly cache: LinkCacheInvalidator,
    private readonly audit: AuditLog,
    private readonly metrics: Metrics,
  ) {}

  /**
   * Runs one check and returns the domain as it stands afterwards, or `null`
   * when it no longer exists.
   */
  async verify(domainId: string, actor: AuditActor): Promise<Domain | null> {
    const domain = await this.dataSource
      .getRepository(Domain)
      .findOneBy({ id: domainId });
    if (domain === null || !isCheckable(domain)) {
      return domain;
    }
    const result = await this.lookUp(domain);
    if (result === null) {
      return this.recordInconclusiveCheck(domain);
    }
    const applied = await this.dataSource.transaction((manager) =>
      this.apply(manager, domain, result),
    );
    if (applied === null) {
      return null;
    }
    await this.afterCommit(applied, actor);
    return applied.domain;
  }

  /** `null` when DNS could not be asked, which proves nothing either way. */
  private async lookUp(domain: Domain): Promise<DomainCheckResult | null> {
    try {
      return await this.checker.check(
        domain.hostname,
        domain.verificationToken,
      );
    } catch (error) {
      if (!(error instanceof DnsLookupError)) {
        throw error;
      }
      this.logger.warn(
        `Check of domain ${domain.id} skipped: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * A resolver outage must not cost every customer their domain, so a check
   * that could not be made counts neither for nor against it. It still counts
   * as a check for the schedule, or it would be retried every minute.
   */
  private async recordInconclusiveCheck(domain: Domain): Promise<Domain> {
    domain.lastCheckedAt = this.clock.now();
    await this.dataSource
      .getRepository(Domain)
      .update({ id: domain.id }, { lastCheckedAt: domain.lastCheckedAt });
    this.countCheck('failed');
    return domain;
  }

  /**
   * Locks every claim to the host, in a fixed order, so two claims verifying
   * at once take turns and a host changes hands in one transaction.
   */
  private async apply(
    manager: EntityManager,
    checked: Domain,
    result: DomainCheckResult,
  ): Promise<AppliedCheck | null> {
    const domains = manager.getRepository(Domain);
    const claims = await domains.find({
      where: { hostname: checked.hostname },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const domain = claims.find((claim) => claim.id === checked.id);
    if (domain === undefined) {
      return null;
    }
    const previousStatus = domain.status;
    if (!isCheckable(domain)) {
      return { domain, previousStatus, displaced: null };
    }
    const serving = claims.find(
      (claim) => claim.id !== domain.id && isServing(claim),
    );
    const now = this.clock.now();
    const next = applyCheck(domain, result, now);
    const activates =
      next.status === DomainStatus.Active &&
      previousStatus !== DomainStatus.Active;
    // A host a platform admin has blocked stays down whoever proves ownership.
    const refused = activates && serving?.status === DomainStatus.Blocked;
    const displaced = activates && !refused ? (serving ?? null) : null;
    if (displaced !== null) {
      // First, so the host is never served by two rows at once.
      await domains.save(
        Object.assign(displaced, {
          status: DomainStatus.Inactive,
          failedChecks: 0,
          verifiedAt: null,
        } satisfies VerificationState),
      );
    }
    Object.assign(domain, refused ? {} : next, result, { lastCheckedAt: now });
    await domains.save(domain);
    return { domain, previousStatus, displaced };
  }

  private async afterCommit(
    { domain, previousStatus, displaced }: AppliedCheck,
    actor: AuditActor,
  ): Promise<void> {
    this.countCheck(outcomeOf(domain));
    if (domain.status === previousStatus) {
      return;
    }
    await this.cache.invalidateDomain(domain.hostname);
    if (displaced !== null) {
      await this.recordDeactivation(
        displaced,
        SYSTEM_ACTOR,
        DEACTIVATION_REASON.OwnershipMoved,
      );
    }
    if (domain.status === DomainStatus.Active) {
      await this.audit.record({
        workspaceId: domain.workspaceId,
        actor,
        action: 'domain.verified',
        target: { type: 'domain', id: domain.id },
        metadata: { hostname: domain.hostname },
      });
      return;
    }
    await this.recordDeactivation(
      domain,
      actor,
      previousStatus === DomainStatus.Active
        ? DEACTIVATION_REASON.DnsCheckFailed
        : DEACTIVATION_REASON.NeverVerified,
    );
  }

  private recordDeactivation(
    domain: Domain,
    actor: AuditActor,
    reason: string,
  ): Promise<void> {
    return this.audit.record({
      workspaceId: domain.workspaceId,
      actor,
      action: 'domain.deactivated',
      target: { type: 'domain', id: domain.id },
      metadata: { hostname: domain.hostname, reason },
    });
  }

  private countCheck(result: 'verified' | 'pending' | 'failed'): void {
    this.metrics.incrementCounter(CounterName.DomainVerifications, { result });
  }
}

function isCheckable(domain: Domain): boolean {
  return domain.workspaceId !== null && domain.status !== DomainStatus.Blocked;
}

function outcomeOf(domain: Domain): 'verified' | 'pending' | 'failed' {
  if (domain.status === DomainStatus.Active && domain.failedChecks === 0) {
    return 'verified';
  }
  return domain.status === DomainStatus.Pending ? 'pending' : 'failed';
}
