import { Logger } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { LinkAnalytics } from '@url-shortener/contracts/analytics';
import { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLICK_CONSUMER_GROUP,
  CLICK_STREAM_KEY,
} from '../../src/analytics/redis-keys.js';
import { partitionName } from '../../src/analytics/retention/partition-plan.js';
import { utcDay } from '../../src/analytics/utc-day.js';
import type { Principal } from '../../src/identity/principal.js';
import { Metrics } from '../../src/common/metrics/metrics.js';
import {
  REDIS_CLIENT,
  createRedisClient,
} from '../../src/redis/redis-client.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  authenticatedAs,
  createWorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  clickOn,
  customizeWith,
  getApi,
  insertLink,
  recordClicks,
  redisOf,
  waitFor,
} from './support.js';

// The configuration is read when the application module is first imported,
// so the role has to be set before any import runs. Every application this
// file starts is a worker: its consumer loop and scheduled jobs really run.
vi.hoisted(() => {
  process.env.PROCESS_ROLE = 'worker';
});

/** A port nothing listens on, so connections are refused immediately. */
const UNREACHABLE_REDIS_URL = 'redis://localhost:1';
const CLICKS = 40;
const SHUTDOWN_BUDGET_MS = 3_000;

type Customize = (builder: TestingModuleBuilder) => TestingModuleBuilder;

describe('a process with the worker role', () => {
  let app: NestExpressApplication | undefined;
  const counted = vi.fn<Metrics['incrementCounter']>();

  const startWorker = async (
    customize: Customize = (builder) => builder,
  ): Promise<NestExpressApplication> => {
    const recordMetrics: Customize = (builder) =>
      builder
        .overrideProvider(Metrics)
        .useValue({ incrementCounter: counted, setGauge: vi.fn() });
    app = await createTestApp(customizeWith(recordMetrics, customize));
    return app;
  };

  /**
   * Stops the worker once the start-up runs of its scheduled jobs are over:
   * a job interrupted by shutdown is harmless, but it logs a failure.
   */
  const stopWorker = async (): Promise<void> => {
    const stopping = app;
    app = undefined;
    if (stopping === undefined) {
      return;
    }
    await waitFor(
      () =>
        Promise.resolve(
          counted.mock.calls.some(
            ([name, labels]) =>
              name === 'job_runs_total' && labels?.job === 'click-partitions',
          ),
        ),
      'the partition job to finish',
    );
    // Every job holds an advisory lock while it runs; none held, none running.
    await waitFor(async () => {
      const rows: Array<{ running: string }> = await stopping.get(DataSource)
        .query(`SELECT count(*) AS "running" FROM pg_locks
          WHERE locktype = 'advisory' AND database =
            (SELECT oid FROM pg_database WHERE datname = current_database())`);
      return rows[0]?.running === '0';
    }, 'every scheduled job to finish');
    await stopping.close();
  };

  afterEach(async () => {
    await stopWorker();
    vi.restoreAllMocks();
    counted.mockReset();
  });

  it('consumes clicks by itself and shows them in analytics', async () => {
    const signedIn: { principal: Principal | null } = { principal: null };
    const running = await startWorker(
      authenticatedAs(() => signedIn.principal),
    );
    await resetState(running);
    const fixture = await createWorkspaceFixture(running);
    signedIn.principal = fixture.principal;
    const link = await insertLink(running, fixture);
    const day = '2026-11-27';
    const path = `/workspaces/${fixture.workspace.id}/links/${link.id}/analytics`;

    await recordClicks(
      running,
      Array.from({ length: CLICKS }, (_unused, index) =>
        clickOn(link.id, { ip: `203.0.113.${index + 1}` }),
      ),
    );

    await waitFor(async () => {
      const response = await getApi(running, path, { from: day, to: day });
      return (response.body as LinkAnalytics).totals.clicks === CLICKS;
    }, 'the worker to roll the clicks up');
    const summary = await redisOf(running).xPending(
      CLICK_STREAM_KEY,
      CLICK_CONSUMER_GROUP,
    );
    expect(summary.pending).toBe(0);
  });

  it('prepares the click partitions when it starts', async () => {
    const dataSource = (await startWorker()).get(DataSource);
    const today = partitionName(utcDay(new Date()));

    await waitFor(async () => {
      const rows: Array<{ found: string | null }> = await dataSource.query(
        'SELECT to_regclass($1)::text AS "found"',
        [today],
      );
      return rows[0]?.found === today;
    }, "today's partition to exist");
  });

  it('leaves no consumer behind in the group when it stops', async () => {
    await startWorker();
    const redis = createRedisClient(process.env.REDIS_URL ?? '');
    await redis.connect();
    try {
      await waitFor(async () => {
        const groups = await redis
          .xInfoConsumers(CLICK_STREAM_KEY, CLICK_CONSUMER_GROUP)
          .catch(() => []);
        return groups.length === 1;
      }, 'the worker to join the consumer group');

      await stopWorker();

      expect(
        await redis.xInfoConsumers(CLICK_STREAM_KEY, CLICK_CONSUMER_GROUP),
      ).toEqual([]);
    } finally {
      redis.destroy();
    }
  });

  it('starts, keeps retrying, and stops promptly while Redis is down', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await startWorker((builder) =>
      builder
        .overrideProvider(REDIS_CLIENT)
        .useValue(createRedisClient(UNREACHABLE_REDIS_URL)),
    );

    const startedAt = Date.now();
    await stopWorker();

    expect(Date.now() - startedAt).toBeLessThan(SHUTDOWN_BUDGET_MS);
  });
});
