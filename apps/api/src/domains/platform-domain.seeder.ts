import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, IsNull } from 'typeorm';
import type { Env } from '../config/env.schema.js';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import { LinkCacheInvalidator } from '../link-cache/link-cache-invalidator.js';
import { generateVerificationToken } from './verification-token.js';

/**
 * Makes sure the platform's own short domain exists: a domain row with no
 * workspace, always active, usable by every workspace (PRD section 8).
 */
@Injectable()
export class PlatformDomainSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformDomainSeeder.name);
  private readonly hostname: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: LinkCacheInvalidator,
    config: ConfigService<Env, true>,
  ) {
    this.hostname = config.get('DEFAULT_SHORT_DOMAIN', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.seed();
  }

  /** Safe to repeat, and safe when several replicas start at once. */
  async seed(): Promise<void> {
    const domains = this.dataSource.getRepository(Domain);
    // The index that lets one row serve a host turns a second insert, by
    // another replica starting at the same moment, into a no-op.
    const inserted = await domains
      .createQueryBuilder()
      .insert()
      .values({
        workspaceId: null,
        hostname: this.hostname,
        status: DomainStatus.Active,
        verificationToken: generateVerificationToken(),
        verifiedAt: () => 'now()',
        ownershipVerified: true,
        routingVerified: true,
      })
      .orIgnore()
      .returning('id')
      .execute();
    const insertedRows = inserted.raw as unknown[];
    if (insertedRows.length > 0) {
      this.logger.log(`Created the platform domain ${this.hostname}`);
      await this.cache.invalidateDomain(this.hostname);
      return;
    }
    const exists = await domains.existsBy({
      hostname: this.hostname,
      workspaceId: IsNull(),
    });
    if (!exists) {
      throw new Error(
        `DEFAULT_SHORT_DOMAIN ${this.hostname} is already connected by a workspace`,
      );
    }
  }
}
