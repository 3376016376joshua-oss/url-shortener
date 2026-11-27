import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ClickRecorder,
  type ClickInput,
} from '../../src/analytics/click-recorder.js';
import { Clock } from '../../src/analytics/clock.js';
import { ClickConsumer } from '../../src/analytics/consumer/click-consumer.js';
import { CLICK_STREAM_KEY } from '../../src/analytics/redis-keys.js';
import { Link } from '../../src/database/entities/link.entity.js';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../src/redis/redis-client.js';
import type { WorkspaceFixture } from '../support/fixtures.js';

export const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const GOOGLEBOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const POLL_INTERVAL_MS = 10;
const POLL_TIMEOUT_MS = 10_000;

type Customize = (builder: TestingModuleBuilder) => TestingModuleBuilder;

/** A `createTestApp` customisation that applies several, in order. */
export function customizeWith(...customizations: Customize[]): Customize {
  return (builder) =>
    customizations.reduce((built, customize) => customize(built), builder);
}

/** A `createTestApp` customisation that makes analytics see `current()` as now. */
export function clockAt(current: () => Date): Customize {
  return (builder) =>
    builder.overrideProvider(Clock).useValue({ now: current });
}

export function redisOf(app: INestApplication): RedisClient {
  return app.get<RedisClient>(REDIS_CLIENT);
}

export async function waitFor(
  condition: () => Promise<boolean>,
  description: string,
): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

let codeSequence = 0;

export function insertLink(
  app: INestApplication,
  fixture: WorkspaceFixture,
  values: Partial<Link> = {},
): Promise<Link> {
  codeSequence += 1;
  return app
    .get(DataSource)
    .getRepository(Link)
    .save({
      workspaceId: fixture.workspace.id,
      domainId: fixture.domain.id,
      code: `code${codeSequence}`,
      destinationUrl: 'https://example.com/landing',
      ...values,
    });
}

/** A click as the redirect path would hand it over; override what matters. */
export function clickOn(
  linkId: string,
  overrides: Partial<ClickInput> = {},
): ClickInput {
  return {
    linkId,
    variantId: null,
    source: 'link',
    clickedAt: new Date('2026-11-27T12:00:00Z'),
    ip: '203.0.113.7',
    userAgent: IPHONE_SAFARI,
    referrer: null,
    ...overrides,
  };
}

/**
 * Hands clicks to the recorder exactly as the redirect path does, then waits
 * until they are on the stream: the recorder itself is never awaited.
 */
export async function recordClicks(
  app: INestApplication,
  clicks: readonly ClickInput[],
): Promise<void> {
  const redis = redisOf(app);
  const before = await redis.xLen(CLICK_STREAM_KEY);
  const recorder = app.get(ClickRecorder);
  clicks.forEach((click) => recorder.record(click));
  await waitFor(
    async () => (await redis.xLen(CLICK_STREAM_KEY)) >= before + clicks.length,
    `${clicks.length} click(s) to reach the stream`,
  );
}

/** The fields of every entry on the click stream, oldest first. */
export async function streamMessages(
  app: INestApplication,
): Promise<Array<Record<string, string>>> {
  const entries = await redisOf(app).xRange(CLICK_STREAM_KEY, '-', '+');
  return (entries ?? []).map(({ message }) => ({ ...message }));
}

/** Runs the consumer, as a worker would, until the stream has nothing new. */
export async function consumeClicks(app: INestApplication): Promise<number> {
  const consumer = app.get(ClickConsumer);
  let total = 0;
  for (;;) {
    const handled = await consumer.consumeOnce();
    if (handled === 0) {
      return total;
    }
    total += handled;
  }
}

export async function recordAndConsume(
  app: INestApplication,
  clicks: readonly ClickInput[],
): Promise<void> {
  await recordClicks(app, clicks);
  await consumeClicks(app);
}

export async function countRows(
  app: INestApplication,
  table: string,
): Promise<number> {
  const rows: Array<{ count: string }> = await app
    .get(DataSource)
    .query(`SELECT count(*) FROM "${table}"`);
  return Number(rows[0]?.count);
}

/** GET on the management API; the caller is whoever the app signs in. */
export function getApi(
  app: INestApplication,
  path: string,
  query: Record<string, string | number> = {},
): request.Test {
  return request(app.getHttpServer() as never)
    .get(`/api/v1${path}`)
    .query(query);
}
