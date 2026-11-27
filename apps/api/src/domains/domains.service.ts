import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { AuditLog } from '../audit/audit-log.js';
import { ApiException } from '../common/errors/api-exception.js';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import { Workspace } from '../database/entities/workspace.entity.js';
import { LinkCacheInvalidator } from '../link-cache/link-cache-invalidator.js';
import type { AuditActor } from './audit-actor.js';
import { Clock } from './clock.js';
import { DomainVerificationService } from './domain-verification.service.js';
import { PlatformHosts } from './platform-hosts.js';
import { generateVerificationToken } from './verification-token.js';
import { wasCheckedRecently } from './verification-policy.js';

/** PRD section 6: the same fixed quota for every workspace. */
export const MAX_DOMAINS_PER_WORKSPACE = 10;

/** Postgres raises these when a row that is still referenced is deleted. */
const STILL_REFERENCED_SQL_STATES: ReadonlySet<string> = new Set([
  '23001',
  '23503',
]);

function isStillReferenced(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('driverError' in error)
  ) {
    return false;
  }
  const { driverError } = error;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    typeof driverError.code === 'string' &&
    STILL_REFERENCED_SQL_STATES.has(driverError.code)
  );
}

const notFound = (): ApiException =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NotFound,
    'Domain not found',
  );

const conflict = (message: string): ApiException =>
  new ApiException(HttpStatus.CONFLICT, ErrorCode.Conflict, message);

/** A workspace's custom domains: claiming, reading, re-checking, removing. */
@Injectable()
export class DomainsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly platformHosts: PlatformHosts,
    private readonly verification: DomainVerificationService,
    private readonly clock: Clock,
    private readonly cache: LinkCacheInvalidator,
    private readonly audit: AuditLog,
  ) {}

  /** The domains a workspace may use: the platform's first, then its own. */
  async list(workspaceId: string): Promise<Domain[]> {
    const domains = await this.dataSource.getRepository(Domain).find({
      where: [{ workspaceId: IsNull() }, { workspaceId }],
      order: { id: 'ASC' },
    });
    const platformFirst = (domain: Domain): number =>
      domain.workspaceId === null ? 0 : 1;
    // Stable, so each group stays in creation order (ids are time-ordered).
    return domains.sort((a, b) => platformFirst(a) - platformFirst(b));
  }

  async get(workspaceId: string, domainId: string): Promise<Domain> {
    const domain = await this.dataSource.getRepository(Domain).findOne({
      where: [
        { id: domainId, workspaceId: IsNull() },
        { id: domainId, workspaceId },
      ],
    });
    if (domain === null) {
      throw notFound();
    }
    return domain;
  }

  /**
   * Records a claim to a host and checks its DNS straight away. A claim is not
   * a reservation: other workspaces may claim the same host, and nothing here
   * reveals whether one has.
   */
  async claim(
    workspaceId: string,
    hostname: string,
    actor: AuditActor,
  ): Promise<Domain> {
    if (this.platformHosts.covers(hostname)) {
      throw conflict(`${hostname} belongs to the platform`);
    }
    const domain = await this.dataSource.transaction((manager) =>
      this.insertClaim(manager, workspaceId, hostname),
    );
    await this.audit.record({
      workspaceId,
      actor,
      action: 'domain.created',
      target: { type: 'domain', id: domain.id },
      metadata: { hostname },
    });
    return (await this.verification.verify(domain.id, actor)) ?? domain;
  }

  /**
   * Checks the DNS now, unless a check was made within the last minute, in
   * which case that check's result is still the answer.
   */
  async verifyNow(
    workspaceId: string,
    domainId: string,
    actor: AuditActor,
  ): Promise<Domain> {
    const domain = await this.getOwn(workspaceId, domainId);
    if (domain.status === DomainStatus.Blocked) {
      throw conflict(`${domain.hostname} has been blocked`);
    }
    if (wasCheckedRecently(domain, this.clock.now())) {
      return domain;
    }
    const checked = await this.verification.verify(domain.id, actor);
    if (checked === null) {
      throw notFound();
    }
    return checked;
  }

  /** Refused while links remain on the domain, or while it is blocked. */
  async remove(
    workspaceId: string,
    domainId: string,
    actor: AuditActor,
  ): Promise<void> {
    const domain = await this.getOwn(workspaceId, domainId);
    if (domain.status === DomainStatus.Blocked) {
      // Deleting the row would delete the block with it.
      throw conflict(`${domain.hostname} has been blocked`);
    }
    try {
      await this.dataSource.getRepository(Domain).delete({ id: domain.id });
    } catch (error) {
      if (isStillReferenced(error)) {
        throw conflict(`${domain.hostname} still has links`);
      }
      throw error;
    }
    await this.cache.invalidateDomain(domain.hostname);
    await this.audit.record({
      workspaceId,
      actor,
      action: 'domain.deleted',
      target: { type: 'domain', id: domain.id },
      metadata: { hostname: domain.hostname },
    });
  }

  /** A domain the workspace owns; a platform domain is not its to change. */
  private async getOwn(workspaceId: string, domainId: string): Promise<Domain> {
    const domain = await this.dataSource
      .getRepository(Domain)
      .findOneBy({ id: domainId, workspaceId });
    if (domain === null) {
      throw notFound();
    }
    return domain;
  }

  private async insertClaim(
    manager: EntityManager,
    workspaceId: string,
    hostname: string,
  ): Promise<Domain> {
    // Serialises claims by one workspace, so the checks below cannot race.
    const workspace = await manager.getRepository(Workspace).findOne({
      where: { id: workspaceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (workspace === null) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NotFound,
        'Workspace not found',
      );
    }
    const domains = manager.getRepository(Domain);
    if (await domains.existsBy({ hostname, status: DomainStatus.Blocked })) {
      throw conflict(`${hostname} has been blocked`);
    }
    if (await domains.existsBy({ workspaceId, hostname })) {
      throw conflict(`${hostname} is already connected to this workspace`);
    }
    if ((await domains.countBy({ workspaceId })) >= MAX_DOMAINS_PER_WORKSPACE) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.QuotaExceeded,
        `A workspace can connect at most ${MAX_DOMAINS_PER_WORKSPACE} domains`,
      );
    }
    return domains.save(
      domains.create({
        workspaceId,
        hostname,
        verificationToken: generateVerificationToken(),
      }),
    );
  }
}
