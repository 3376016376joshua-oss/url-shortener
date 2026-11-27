import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { JobScheduler } from '../../common/jobs/job-scheduler.js';
import { Clock } from '../clock.js';
import { addDays } from '../utc-day.js';
import {
  partitionDay,
  partitionName,
  planPartitions,
} from './partition-plan.js';

const JOB_NAME = 'click-partitions';
const DAILY_MS = 24 * 3_600_000;

const LIST_PARTITIONS = `
  SELECT child."relname" AS "name"
  FROM pg_inherits
  JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
  JOIN pg_class child ON child.oid = pg_inherits.inhrelid
  WHERE parent."relname" = 'click_events'
    AND parent."relnamespace" = current_schema()::regnamespace`;

const DAYS_IN_DEFAULT = `
  SELECT DISTINCT to_char("clicked_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day"
  FROM "click_events_default"`;

/**
 * Keeps `click_events` partitioned by UTC day and enforces the 90 day
 * retention of raw events by dropping whole partitions (PRD section 10).
 * Runs at worker start-up and once a day; safe to repeat.
 */
@Injectable()
export class ClickPartitions implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClickPartitions.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly scheduler: JobScheduler,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduler.register({
      name: JOB_NAME,
      everyMs: DAILY_MS,
      run: () => this.maintain(),
    });
  }

  /** Creates the partitions that are due and removes clicks past retention. */
  async maintain(): Promise<void> {
    const daysWaitingInDefault = await this.listDaysInDefault();
    if (daysWaitingInDefault.length > 0) {
      // Maintenance fell behind: clicks arrived for days without a partition.
      // They are moved or removed below; the warning is what raises the alert.
      this.logger.warn(
        `click_events_default is not empty: it holds clicks of ${daysWaitingInDefault.length} day(s)`,
      );
    }
    const plan = planPartitions({
      now: this.clock.now(),
      existingDays: await this.listPartitionDays(),
      daysWaitingInDefault,
    });
    for (const day of plan.create) {
      await this.createPartition(day);
    }
    for (const day of plan.drop) {
      await this.dataSource.query(`DROP TABLE "${partitionName(day)}"`);
    }
    await this.dataSource.query(
      `DELETE FROM "click_events_default" WHERE "clicked_at" < $1`,
      [`${plan.keepFrom}T00:00:00Z`],
    );
  }

  private async listPartitionDays(): Promise<string[]> {
    const rows: Array<{ name: string }> =
      await this.dataSource.query(LIST_PARTITIONS);
    return rows.flatMap(({ name }) => partitionDay(name) ?? []);
  }

  private async listDaysInDefault(): Promise<string[]> {
    const rows: Array<{ day: string }> =
      await this.dataSource.query(DAYS_IN_DEFAULT);
    return rows.map(({ day }) => day);
  }

  /**
   * Postgres refuses to attach a partition while the default partition holds
   * rows that belong in it, so those rows are moved first. The lock on the
   * parent keeps new clicks for that day from slipping into the default
   * partition between the move and the attach; it is held for milliseconds.
   */
  private async createPartition(day: string): Promise<void> {
    const name = partitionName(day);
    // Both bounds come from a validated day, so they are safe to inline;
    // DDL cannot take bind parameters.
    const from = `${day}T00:00:00Z`;
    const to = `${addDays(day, 1)}T00:00:00Z`;
    await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query('LOCK TABLE "click_events" IN ACCESS EXCLUSIVE MODE');
      await manager.query(
        `CREATE TABLE "${name}"
           (LIKE "click_events" INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`,
      );
      await manager.query(
        `WITH moved AS (
           DELETE FROM "click_events_default"
           WHERE "clicked_at" >= $1 AND "clicked_at" < $2
           RETURNING *)
         INSERT INTO "${name}" SELECT * FROM moved`,
        [from, to],
      );
      await manager.query(
        `ALTER TABLE "click_events" ATTACH PARTITION "${name}"
           FOR VALUES FROM ('${from}') TO ('${to}')`,
      );
    });
  }
}
