import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  JobScheduler,
  type ScheduledJob,
} from '../src/common/jobs/job-scheduler.js';
import { Metrics } from '../src/common/metrics/metrics.js';
import type { Env } from '../src/config/env.schema.js';
import { createTestApp } from './support/create-test-app.js';

const HOUR_MS = 3_600_000;

/** A promise the test resolves by hand, to hold a job in the middle of a run. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('JobScheduler', () => {
  let app: NestExpressApplication;
  let scheduler: JobScheduler;

  const schedulerWithRole = (role: Env['PROCESS_ROLE']): JobScheduler =>
    new JobScheduler(
      { get: () => role } as unknown as ConfigService<Env, true>,
      app.get(DataSource),
      app.get(Metrics),
    );

  const job = (name: string, run: () => Promise<void>): ScheduledJob => ({
    name,
    everyMs: HOUR_MS,
    run,
  });

  beforeAll(async () => {
    app = await createTestApp();
    scheduler = schedulerWithRole('worker');
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a job and reports that it ran', async () => {
    const run = vi.fn(() => Promise.resolve());

    await expect(scheduler.runExclusively(job('runs', run))).resolves.toBe(
      true,
    );
    expect(run).toHaveBeenCalledOnce();
  });

  it('does not start a job that another worker is already running', async () => {
    const hold = deferred();
    const started = deferred();
    const first = scheduler.runExclusively(
      job('exclusive', async () => {
        started.resolve();
        await hold.promise;
      }),
    );
    await started.promise;
    const secondRun = vi.fn(() => Promise.resolve());

    const second = await schedulerWithRole('worker').runExclusively(
      job('exclusive', secondRun),
    );
    hold.resolve();

    expect(second).toBe(false);
    expect(secondRun).not.toHaveBeenCalled();
    await expect(first).resolves.toBe(true);
  });

  it('runs different jobs at the same time', async () => {
    const hold = deferred();
    const started = deferred();
    const first = scheduler.runExclusively(
      job('job-a', async () => {
        started.resolve();
        await hold.promise;
      }),
    );
    await started.promise;

    const other = await scheduler.runExclusively(
      job('job-b', () => Promise.resolve()),
    );
    hold.resolve();
    await first;

    expect(other).toBe(true);
  });

  it('survives a failing job and can run it again', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failing = job('flaky', () => Promise.reject(new Error('boom')));
    const working = job('flaky', () => Promise.resolve());

    await expect(scheduler.runExclusively(failing)).resolves.toBe(false);
    await expect(scheduler.runExclusively(working)).resolves.toBe(true);
  });

  it('registers nothing in a process without the worker role', async () => {
    const run = vi.fn(() => Promise.resolve());
    const webOnly = schedulerWithRole('web');

    webOnly.register(job('web-role', run));
    await new Promise((resolve) => setImmediate(resolve));
    webOnly.onApplicationShutdown();

    expect(run).not.toHaveBeenCalled();
  });

  it('runs a registered job straight away in a worker', async () => {
    const ran = deferred();
    const run = vi.fn(() => Promise.resolve(ran.resolve()));
    const worker = schedulerWithRole('worker');

    worker.register(job('registered', run));
    await ran.promise;
    worker.onApplicationShutdown();

    expect(run).toHaveBeenCalledOnce();
  });
});
