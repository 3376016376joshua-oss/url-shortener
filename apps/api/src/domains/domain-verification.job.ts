import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JobScheduler } from '../common/jobs/job-scheduler.js';
import { SYSTEM_ACTOR } from './audit-actor.js';
import { Clock } from './clock.js';
import { DomainVerificationService } from './domain-verification.service.js';
import { FAST_RECHECK_INTERVAL_MS, dueCutoffs } from './verification-policy.js';

const JOB_NAME = 'domain-verification';
/** Domains read per query, and the most queries one run makes. */
const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 20;
/** DNS lookups in flight at once, so a sweep cannot flood the resolver. */
const CHECK_CONCURRENCY = 10;

/**
 * Pending claims are due every minute in their first hour and hourly after
 * that; active domains daily. A check always stamps `last_checked_at`, which
 * is what takes a domain out of this set until its next turn.
 */
const DUE_DOMAINS_SQL = `
  SELECT "id" FROM "domains"
  WHERE "workspace_id" IS NOT NULL
    AND (
      ("status" = 'PENDING'
        AND COALESCE("last_checked_at", '-infinity') <= CASE
          WHEN "created_at" > $1 THEN $2::timestamptz
          ELSE $3::timestamptz
        END)
      OR ("status" = 'ACTIVE'
        AND COALESCE("last_checked_at", '-infinity') <= $4)
    )
  ORDER BY "last_checked_at" ASC NULLS FIRST, "id" ASC
  LIMIT $5
`;

/** The scheduled re-check of pending and active domains (PRD section 8). */
@Injectable()
export class DomainVerificationJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(DomainVerificationJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly scheduler: JobScheduler,
    private readonly verification: DomainVerificationService,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduler.register({
      name: JOB_NAME,
      everyMs: FAST_RECHECK_INTERVAL_MS,
      run: () => this.run(),
    });
  }

  /**
   * Checks every domain that is due. Safe to repeat: a domain checked by an
   * interrupted run is simply no longer due.
   */
  async run(): Promise<void> {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const domainIds = await this.findDueDomainIds();
      const failures = await this.checkAll(domainIds);
      if (failures > 0) {
        // The failed domains are still due; the next run retries them.
        throw new Error(`${failures} domain checks failed`);
      }
      if (domainIds.length < BATCH_SIZE) {
        return;
      }
    }
  }

  private async findDueDomainIds(): Promise<string[]> {
    const cutoffs = dueCutoffs(this.clock.now());
    const rows: Array<{ id: string }> = await this.dataSource.query(
      DUE_DOMAINS_SQL,
      [
        cutoffs.fastWindowStart,
        cutoffs.fastCheckedBefore,
        cutoffs.slowCheckedBefore,
        cutoffs.activeCheckedBefore,
        BATCH_SIZE,
      ],
    );
    return rows.map((row) => row.id);
  }

  /** Returns how many checks threw, having logged each one. */
  private async checkAll(domainIds: string[]): Promise<number> {
    let failures = 0;
    for (let start = 0; start < domainIds.length; start += CHECK_CONCURRENCY) {
      const group = domainIds.slice(start, start + CHECK_CONCURRENCY);
      const results = await Promise.allSettled(
        group.map((id) => this.verification.verify(id, SYSTEM_ACTOR)),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failures += 1;
          this.logger.error(
            `Check of domain ${group[index]} failed: ${String(result.reason)}`,
          );
        }
      });
    }
    return failures;
  }
}
