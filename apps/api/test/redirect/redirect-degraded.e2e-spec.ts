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
import { ClickRecorder } from '../../src/analytics/click-recorder.js';
import { Metrics } from '../../src/common/metrics/metrics.js';
import { LinkCacheInvalidator } from '../../src/link-cache/link-cache-invalidator.js';
import {
  REDIS_CLIENT,
  createRedisClient,
} from '../../src/redis/redis-client.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import { PLATFORM_HOST, createLink, follow } from './redirect-fixtures.js';

/** A port nothing listens on, so connections are refused immediately. */
const UNREACHABLE_REDIS_URL = 'redis://localhost:1';

const SERVICE_UNAVAILABLE_BODY = {
  statusCode: 503,
  error: 'Service Unavailable',
  code: 'SERVICE_UNAVAILABLE',
  message: 'The service is temporarily unavailable',
};

/** What node-postgres raises when nothing answers on the database port. */
const connectionRefused = (): Error =>
  Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
    code: 'ECONNREFUSED',
  });

describe('GET /{code} when a dependency is down', () => {
  let app: NestExpressApplication;
  let appWithoutRedis: NestExpressApplication;
  let tenant: WorkspaceFixture;
  const incrementCounter = vi.fn();
  const metrics = { incrementCounter, setGauge: vi.fn() };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(Metrics).useValue(metrics),
    );
    appWithoutRedis = await createTestApp((builder) =>
      builder
        .overrideProvider(Metrics)
        .useValue(metrics)
        .overrideProvider(REDIS_CLIENT)
        .useValue(createRedisClient(UNREACHABLE_REDIS_URL))
        // With Redis gone the click cannot be recorded either.
        .overrideProvider(ClickRecorder)
        .useValue({
          record: () => {
            throw new Error('the click stream is unreachable');
          },
        }),
    );
  });

  afterAll(async () => {
    await app.close();
    await appWithoutRedis.close();
  });

  beforeEach(async () => {
    await resetState(app);
    tenant = await createWorkspaceFixture(app);
    incrementCounter.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const link = (overrides: Parameters<typeof createLink>[3] = {}) =>
    createLink(app, tenant.domain, tenant.workspace.id, overrides);

  const stopPostgres = (target: NestExpressApplication): void => {
    vi.spyOn(target.get(DataSource), 'query').mockRejectedValue(
      connectionRefused(),
    );
  };

  describe('Redis down', () => {
    it('answers from Postgres, and no error reaches the visitor', async () => {
      const { code, destinationUrl } = await link();

      const first = await follow(appWithoutRedis, code);
      const second = await follow(appWithoutRedis, code);

      expect(first.status).toBe(302);
      expect(second.status).toBe(302);
      expect(second.headers['location']).toBe(destinationUrl);
      expect(incrementCounter).toHaveBeenCalledWith(
        'link_cache_lookups_total',
        { result: 'error' },
      );
    });

    it('still tells an unknown code and a disabled link apart', async () => {
      const { code } = await link({ status: 'DISABLED' });

      expect((await follow(appWithoutRedis, 'nosuch1')).status).toBe(404);
      expect((await follow(appWithoutRedis, code)).status).toBe(410);
    });

    it('lets a write finish, and counts the lost invalidation', async () => {
      const invalidator = appWithoutRedis.get(LinkCacheInvalidator);

      await expect(
        invalidator.invalidateLink(PLATFORM_HOST, 'launch'),
      ).resolves.toBeUndefined();
      await expect(
        invalidator.invalidateDomain(PLATFORM_HOST),
      ).resolves.toBeUndefined();

      expect(
        incrementCounter.mock.calls.filter(
          ([name]) => name === 'link_cache_invalidation_failures_total',
        ),
      ).toHaveLength(2);
    });
  });

  describe('Postgres down', () => {
    it('keeps redirecting a link that is still cached', async () => {
      const { code, destinationUrl } = await link();
      await follow(app, code);
      stopPostgres(app);

      const response = await follow(app, code);

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe(destinationUrl);
    });

    it('keeps answering 404 for a code cached as unknown', async () => {
      await follow(app, 'nosuch1');
      stopPostgres(app);

      expect((await follow(app, 'nosuch1')).status).toBe(404);
    });

    it('answers 503 for a code that is not cached', async () => {
      const { code } = await link();
      stopPostgres(app);

      const response = await follow(app, code);

      expect(response.status).toBe(503);
      expect(response.body).toEqual(SERVICE_UNAVAILABLE_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(incrementCounter).toHaveBeenCalledWith('redirects_total', {
        outcome: 'unavailable',
      });
    });

    it('recovers as soon as Postgres is back, without caching the outage', async () => {
      const { code } = await link();
      stopPostgres(app);
      await follow(app, code);
      vi.restoreAllMocks();

      expect((await follow(app, code)).status).toBe(302);
    });
  });

  describe('both down', () => {
    it('answers 503', async () => {
      const { code } = await link();
      stopPostgres(appWithoutRedis);

      const response = await follow(appWithoutRedis, code);

      expect(response.status).toBe(503);
      expect(response.body).toEqual(SERVICE_UNAVAILABLE_BODY);
    });
  });
});
