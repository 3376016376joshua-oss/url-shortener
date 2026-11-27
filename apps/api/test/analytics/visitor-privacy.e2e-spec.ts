import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { LinkAnalytics } from '@url-shortener/contracts/analytics';
import { DataSource } from 'typeorm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ClickRecorder } from '../../src/analytics/click-recorder.js';
import {
  visitorSaltKey,
  visitorSketchKey,
} from '../../src/analytics/redis-keys.js';
import { hashVisitor } from '../../src/analytics/recorder/visitor-hash.js';
import { Metrics } from '../../src/common/metrics/metrics.js';
import type { Link } from '../../src/database/entities/link.entity.js';
import {
  REDIS_CLIENT,
  createRedisClient,
} from '../../src/redis/redis-client.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  authenticatedAs,
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  GOOGLEBOT,
  WINDOWS_CHROME,
  clickOn,
  getApi,
  insertLink,
  recordAndConsume,
  redisOf,
  streamMessages,
  waitFor,
} from './support.js';

const DAY = '2026-11-27';
const NEXT_DAY = '2026-11-28';
const HOURS_48 = 48 * 3_600;
const VISITOR = {
  ip: '203.0.113.99',
  userAgent: WINDOWS_CHROME,
  referrer: 'https://mail.example.org/inbox/message-8841?token=s3cr3t',
};
/** A port nothing listens on, so connections are refused immediately. */
const UNREACHABLE_REDIS_URL = 'redis://localhost:1';

describe('unique visitors and privacy', () => {
  let app: NestExpressApplication;
  let fixture: WorkspaceFixture;
  let link: Link;

  const analytics = async (
    from: string,
    to: string,
  ): Promise<LinkAnalytics> => {
    const response = await getApi(
      app,
      `/workspaces/${fixture.workspace.id}/links/${link.id}/analytics`,
      { from, to },
    );
    return response.body as LinkAnalytics;
  };

  /** Every row of every table, as one searchable text. */
  const dumpPostgres = async (): Promise<string> => {
    const dataSource = app.get(DataSource);
    const dumps = await Promise.all(
      dataSource.entityMetadatas.map(async ({ tableName }) => {
        const rows: Array<{ dump: string | null }> = await dataSource.query(
          `SELECT json_agg(t)::text AS "dump" FROM "${tableName}" AS t`,
        );
        return rows[0]?.dump ?? '';
      }),
    );
    return dumps.join('\n');
  };

  beforeAll(async () => {
    app = await createTestApp(authenticatedAs(() => fixture.principal));
  });

  beforeEach(async () => {
    await resetState(app);
    fixture = await createWorkspaceFixture(app);
    link = await insertLink(app, fixture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('counts two clicks from one visitor on one day as one unique visitor', async () => {
    await recordAndConsume(app, [
      clickOn(link.id, VISITOR),
      clickOn(link.id, VISITOR),
    ]);

    expect((await analytics(DAY, DAY)).totals).toEqual({
      clicks: 2,
      uniqueVisitors: 1,
    });
  });

  it('counts the same visitor again the next day', async () => {
    await recordAndConsume(app, [
      clickOn(link.id, VISITOR),
      clickOn(link.id, {
        ...VISITOR,
        clickedAt: new Date(`${NEXT_DAY}T09:00:00Z`),
      }),
    ]);

    const { totals, series } = await analytics(DAY, NEXT_DAY);
    expect(totals).toEqual({ clicks: 2, uniqueVisitors: 2 });
    expect(series).toEqual([
      { bucket: DAY, clicks: 1, uniqueVisitors: 1 },
      { bucket: NEXT_DAY, clicks: 1, uniqueVisitors: 1 },
    ]);
  });

  it('tells apart two visitors who share an address but not a browser', async () => {
    await recordAndConsume(app, [
      clickOn(link.id, VISITOR),
      clickOn(link.id, { ...VISITOR, userAgent: `${WINDOWS_CHROME} Edg/130` }),
    ]);

    expect((await analytics(DAY, DAY)).totals.uniqueVisitors).toBe(2);
  });

  it('counts 1,000 distinct visitors in a day to within 2%', async () => {
    const clicks = Array.from({ length: 1_000 }, (_unused, index) =>
      clickOn(link.id, {
        ip: `10.${Math.floor(index / 250)}.${index % 250}.1`,
      }),
    );

    await recordAndConsume(app, clicks);

    const { totals } = await analytics(DAY, DAY);
    expect(totals.clicks).toBe(1_000);
    expect(totals.uniqueVisitors).toBeGreaterThanOrEqual(980);
    expect(totals.uniqueVisitors).toBeLessThanOrEqual(1_020);
  });

  it('never lowers a count when the sketch is gone, and never counts a bot', async () => {
    await recordAndConsume(app, [clickOn(link.id, VISITOR)]);
    await redisOf(app).del(visitorSketchKey(link.id, DAY));

    await recordAndConsume(app, [
      clickOn(link.id, { ip: '203.0.113.50', userAgent: GOOGLEBOT }),
    ]);

    expect((await analytics(DAY, DAY)).totals.uniqueVisitors).toBe(1);
    expect(await redisOf(app).exists(visitorSketchKey(link.id, DAY))).toBe(0);
  });

  it('keeps the address, user agent, referrer, and visitor hash out of every store and log', async () => {
    const logged: string[] = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation((...parts) => {
        logged.push(parts.map(String).join(' '));
      });
    }

    await recordAndConsume(app, [clickOn(link.id, VISITOR)]);

    const redis = redisOf(app);
    const salt = (await redis.get(visitorSaltKey(DAY))) ?? '';
    const entries = await streamMessages(app);
    const everything = [
      await dumpPostgres(),
      JSON.stringify(entries),
      (await redis.keys('*')).join('\n'),
      logged.join('\n'),
    ].join('\n');
    const secrets = [
      VISITOR.ip,
      VISITOR.userAgent,
      VISITOR.referrer,
      'message-8841',
      's3cr3t',
      hashVisitor(salt, VISITOR.ip, VISITOR.userAgent),
    ];

    expect(salt).not.toBe('');
    expect(entries).toHaveLength(1);
    for (const secret of secrets) {
      expect(everything).not.toContain(secret);
    }
    // What is kept instead: the reduced facts.
    expect(everything).toContain('mail.example.org');
    expect(everything).toContain('Windows');
  });

  it('keeps the salt and the sketches only in Redis, and only for 48 hours', async () => {
    await recordAndConsume(app, [clickOn(link.id, VISITOR)]);

    const redis = redisOf(app);
    const salt = (await redis.get(visitorSaltKey(DAY))) ?? '';
    const saltTtl = await redis.ttl(visitorSaltKey(DAY));
    const sketchTtl = await redis.ttl(visitorSketchKey(link.id, DAY));

    expect(salt.length).toBeGreaterThanOrEqual(32);
    expect(saltTtl).toBeGreaterThan(HOURS_48 - 60);
    expect(saltTtl).toBeLessThanOrEqual(HOURS_48);
    expect(sketchTtl).toBeGreaterThan(HOURS_48 - 60);
    expect(sketchTtl).toBeLessThanOrEqual(HOURS_48);
    expect(await dumpPostgres()).not.toContain(salt);
  });

  it('uses one salt for a whole day and a different one the next day', async () => {
    await recordAndConsume(app, [
      clickOn(link.id, VISITOR),
      clickOn(link.id, { ...VISITOR, ip: '203.0.113.100' }),
      clickOn(link.id, { clickedAt: new Date(`${NEXT_DAY}T09:00:00Z`) }),
    ]);

    const redis = redisOf(app);
    const today = await redis.get(visitorSaltKey(DAY));
    const tomorrow = await redis.get(visitorSaltKey(NEXT_DAY));
    expect(today).not.toBeNull();
    expect(tomorrow).not.toBeNull();
    expect(tomorrow).not.toBe(today);
  });

  describe('with Redis down', () => {
    let offline: NestExpressApplication;

    beforeAll(async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      offline = await createTestApp((builder) =>
        builder
          .overrideProvider(REDIS_CLIENT)
          .useValue(createRedisClient(UNREACHABLE_REDIS_URL)),
      );
    });

    afterAll(async () => {
      await offline.close();
    });

    it('drops the click, counts the loss, and never throws at the redirect', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const counted = vi.spyOn(offline.get(Metrics), 'incrementCounter');
      const recorder = offline.get(ClickRecorder);

      expect(() => recorder.record(clickOn(link.id, VISITOR))).not.toThrow();
      expect(() => recorder.record(clickOn(link.id, VISITOR))).not.toThrow();

      await waitFor(
        () => Promise.resolve(counted.mock.calls.length === 2),
        'both clicks to be counted as dropped',
      );
      expect(counted).toHaveBeenCalledWith('click_events_total', {
        result: 'dropped',
      });
      // Said once, not once per click, and without the visitor's details.
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).not.toContain(VISITOR.ip);
    });
  });
});
