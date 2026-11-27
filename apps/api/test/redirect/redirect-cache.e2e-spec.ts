import type { NestExpressApplication } from '@nestjs/platform-express';
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
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import { Metrics } from '../../src/common/metrics/metrics.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { domainKey, linkKey } from '../../src/link-cache/cache-policy.js';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../src/redis/redis-client.js';
import { Clock } from '../../src/redirect/clock.js';
import { RedirectLinkRepository } from '../../src/redirect/redirect-link.repository.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  PLATFORM_HOST,
  TestClock,
  createLink,
  follow,
} from './redirect-fixtures.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

describe('the redirect cache', () => {
  let app: NestExpressApplication;
  let redis: RedisClient;
  let tenant: WorkspaceFixture;
  const clock = new TestClock();
  const incrementCounter = vi.fn();

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(Metrics)
        .useValue({ incrementCounter, setGauge: vi.fn() }),
    );
    redis = app.get<RedisClient>(REDIS_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetState(app);
    clock.reset();
    tenant = await createWorkspaceFixture(app);
    incrementCounter.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const link = (overrides: Parameters<typeof createLink>[3] = {}) =>
    createLink(app, tenant.domain, tenant.workspace.id, overrides);

  /** Counts every statement the application sends to Postgres from now on. */
  const watchPostgres = () => vi.spyOn(app.get(DataSource), 'query');

  const lookupResults = (): unknown[] =>
    incrementCounter.mock.calls
      .filter(([name]) => name === 'link_cache_lookups_total')
      .map(([, labels]) => (labels as { result: string }).result);

  describe('hits', () => {
    it('answers the second redirect of a link without a Postgres query', async () => {
      const { code, destinationUrl } = await link();
      await follow(app, code);
      const postgres = watchPostgres();

      const response = await follow(app, code);

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe(destinationUrl);
      expect(postgres).not.toHaveBeenCalled();
      expect(lookupResults()).toEqual(['miss', 'hit']);
    });

    it('reaches Postgres once for an unknown code asked for twice', async () => {
      const postgres = watchPostgres();

      const first = await follow(app, 'nosuch1');
      const second = await follow(app, 'nosuch1');

      expect([first.status, second.status]).toEqual([404, 404]);
      expect(postgres).toHaveBeenCalledTimes(1);
      expect(lookupResults()).toEqual(['miss', 'negative_hit']);
    });

    it('reaches Postgres once for an unknown host, whatever the code', async () => {
      const postgres = watchPostgres();

      await follow(app, 'code001', 'unknown.example');
      await follow(app, 'code002', 'unknown.example');

      expect(postgres).toHaveBeenCalledTimes(1);
    });

    it('caches a disabled link, and keeps answering 410 from the cache', async () => {
      const { code } = await link({ status: StoredLinkStatus.Disabled });
      await follow(app, code);
      const postgres = watchPostgres();

      const response = await follow(app, code);

      expect(response.status).toBe(410);
      expect(postgres).not.toHaveBeenCalled();
    });
  });

  describe('expiry', () => {
    it('answers 410 the moment a cached link expires, without asking Postgres', async () => {
      const expiresAt = new Date(Date.now() + 30 * MINUTE_MS);
      const { code } = await link({ expiresAt });
      expect((await follow(app, code)).status).toBe(302);
      const postgres = watchPostgres();

      clock.set(new Date(expiresAt.getTime() - 1));
      const justBefore = await follow(app, code);
      clock.set(expiresAt);
      const atExpiry = await follow(app, code);

      expect(justBefore.status).toBe(302);
      expect(atExpiry.status).toBe(410);
      expect(atExpiry.body).toMatchObject({ code: 'LINK_EXPIRED' });
      expect(postgres).not.toHaveBeenCalled();
    });
  });

  describe('time to live', () => {
    const ttlOf = (key: string): Promise<number> => redis.pTTL(key);

    it('keeps a domain and a link for an hour', async () => {
      const { code } = await link();

      await follow(app, code);

      for (const key of [
        domainKey(PLATFORM_HOST),
        linkKey(PLATFORM_HOST, code),
      ]) {
        const ttl = await ttlOf(key);
        expect(ttl).toBeGreaterThan(HOUR_MS - MINUTE_MS);
        expect(ttl).toBeLessThanOrEqual(HOUR_MS);
      }
    });

    it('never keeps a link past its expiry', async () => {
      const { code } = await link({
        expiresAt: new Date(Date.now() + 10 * MINUTE_MS),
      });

      await follow(app, code);

      const ttl = await ttlOf(linkKey(PLATFORM_HOST, code));
      expect(ttl).toBeGreaterThan(9 * MINUTE_MS);
      expect(ttl).toBeLessThanOrEqual(10 * MINUTE_MS);
    });

    it.each([
      ['an unknown code', {}, 'nosuch1'],
      [
        'an already expired link',
        { code: 'expired', expiresAt: new Date(Date.now() - 1_000) },
        'expired',
      ],
    ])('keeps %s for 60 seconds', async (_reason, overrides, code) => {
      await link(overrides);

      await follow(app, code);

      const ttl = await ttlOf(linkKey(PLATFORM_HOST, code));
      expect(ttl).toBeGreaterThan(MINUTE_MS - 5_000);
      expect(ttl).toBeLessThanOrEqual(MINUTE_MS);
    });

    it('keeps an unknown host for 60 seconds, and no entry for its codes', async () => {
      await follow(app, 'code001', 'unknown.example');

      const ttl = await ttlOf(domainKey('unknown.example'));
      expect(ttl).toBeGreaterThan(MINUTE_MS - 5_000);
      expect(ttl).toBeLessThanOrEqual(MINUTE_MS);
      expect(await redis.exists(linkKey('unknown.example', 'code001'))).toBe(0);
    });
  });

  describe('single flight', () => {
    it('shares one Postgres read between concurrent misses for one link', async () => {
      const { code } = await link();
      const repository = app.get(RedirectLinkRepository);
      const find = repository.findByHostAndCode.bind(repository);
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = vi
        .spyOn(repository, 'findByHostAndCode')
        .mockImplementation(async (host, requested) => {
          await held;
          return find(host, requested);
        });

      const responses = Array.from({ length: 10 }, () =>
        follow(app, code).then((response) => response.status),
      );
      await vi.waitFor(() => {
        expect(lookupResults()).toHaveLength(10);
      });
      release();

      expect(await Promise.all(responses)).toEqual(Array(10).fill(302));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not share a failed read with later requests', async () => {
      const { code } = await link();
      vi.spyOn(app.get(DataSource), 'query').mockRejectedValueOnce(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
      );

      expect((await follow(app, code)).status).toBe(503);
      expect((await follow(app, code)).status).toBe(302);
    });
  });

  describe('unreadable entries', () => {
    it('answers from Postgres when a cached value is not what it should be', async () => {
      const { code, destinationUrl } = await link();
      await redis.set(linkKey(PLATFORM_HOST, code), 'not json');

      const response = await follow(app, code);

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe(destinationUrl);
    });
  });

  it('keeps serving the cached row when a write does not invalidate it', async () => {
    // Documents why every write must invalidate: the cache cannot know.
    const created = await link();
    await follow(app, created.code);
    await app
      .get(DataSource)
      .getRepository(Link)
      .update(created.id, { status: StoredLinkStatus.Disabled });

    expect((await follow(app, created.code)).status).toBe(302);
  });
});
