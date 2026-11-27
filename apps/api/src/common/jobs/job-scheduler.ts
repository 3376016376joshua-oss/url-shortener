import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Env } from '../../config/env.schema.js';
import { CounterName, Metrics } from '../metrics/metrics.js';

export interface ScheduledJob {
  /** Unique across the application; it is also the name of the job's lock. */
  name: string;
  /** How often to run. The job also runs once when it is registered. */
  everyMs: number;
  /** Must be safe to repeat: a crash can leave a run half done. */
  run: () => Promise<void>;
}

/** Separates job locks from every other advisory lock in the database. */
const JOB_LOCK_NAMESPACE = 20_261_127;

/** True in a process that should run consumers and scheduled jobs. */
export function runsBackgroundWork(role: Env['PROCESS_ROLE']): boolean {
  return role !== 'web';
}

/**
 * Runs periodic background jobs. A job runs only in processes with the worker
 * role, and in only one of them at a time: each run holds a Postgres advisory
 * lock named after the job, so adding workers never doubles the work.
 */
@Injectable()
export class JobScheduler implements OnApplicationShutdown {
  private readonly logger = new Logger(JobScheduler.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly enabled: boolean;

  constructor(
    config: ConfigService<Env, true>,
    private readonly dataSource: DataSource,
    private readonly metrics: Metrics,
  ) {
    this.enabled = runsBackgroundWork(
      config.get('PROCESS_ROLE', { infer: true }),
    );
  }

  /** Call from `onApplicationBootstrap`. Ignored outside the worker role. */
  register(job: ScheduledJob): void {
    if (!this.enabled) {
      return;
    }
    const tick = (): void => void this.runExclusively(job);
    this.timers.push(setInterval(tick, job.everyMs));
    tick();
  }

  /**
   * Runs the job now unless another run of it is in progress anywhere, and
   * says whether it ran to completion. Never rejects: a failed run is logged,
   * counted, and retried at the next interval.
   */
  async runExclusively(job: ScheduledJob): Promise<boolean> {
    const lock = [JOB_LOCK_NAMESPACE, job.name];
    const session = this.dataSource.createQueryRunner();
    try {
      await session.connect();
      const rows = (await session.query(
        'SELECT pg_try_advisory_lock($1, hashtext($2)) AS "acquired"',
        lock,
      )) as Array<{ acquired: boolean }>;
      if (rows[0]?.acquired !== true) {
        return false;
      }
      try {
        await job.run();
      } finally {
        await session.query(
          'SELECT pg_advisory_unlock($1, hashtext($2))',
          lock,
        );
      }
      this.metrics.incrementCounter(CounterName.JobRuns, {
        job: job.name,
        result: 'success',
      });
      return true;
    } catch (error) {
      this.logger.error(`Job ${job.name} failed: ${String(error)}`);
      this.metrics.incrementCounter(CounterName.JobRuns, {
        job: job.name,
        result: 'failure',
      });
      return false;
    } finally {
      await session.release();
    }
  }

  onApplicationShutdown(): void {
    this.timers.forEach((timer) => clearInterval(timer));
  }
}
