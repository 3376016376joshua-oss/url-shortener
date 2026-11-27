import { setTimeout as sleep } from 'node:timers/promises';
import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import { MetricsModule } from '../src/common/metrics/metrics.module.js';
import {
  RATE_LIMIT_SETTINGS,
  type RateLimitSettings,
} from '../src/common/rate-limit/rate-limit-policy.js';
import { RateLimitModule } from '../src/common/rate-limit/rate-limit.module.js';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { ApiExceptionFilter } from '../src/http/api-exception.filter.js';
import {
  REDIS_CLIENT,
  createRedisClient,
  type RedisClient,
} from '../src/redis/redis-client.js';
import { RedisModule } from '../src/redis/redis.module.js';
import { createTestApp } from './support/create-test-app.js';

/** Short enough to wait out in a test, long enough to send a burst within. */
const WINDOW_SECONDS = 2;
const WINDOW_MS = WINDOW_SECONDS * 1_000;
const GENEROUS = 1_000;
const UNREACHABLE_REDIS_URL = 'redis://localhost:1';
const SOME_USER = '/api/v1/admin/users/0198c0de-0000-7000-8000-000000000001';

type Limits = Partial<RateLimitSettings['limits']>;

function settings(limits: Limits): RateLimitSettings {
  return {
    windowSeconds: WINDOW_SECONDS,
    limits: {
      redirect: GENEROUS,
      api: GENEROUS,
      credential: GENEROUS,
      auth: GENEROUS,
      ...limits,
    },
  };
}

/**
 * Stands in for routes other workstreams own, so the limiter is exercised on
 * the redirect and sign-in paths without depending on their controllers.
 */
@Controller()
class ProbeController {
  @Post('api/v1/auth/sign-in')
  @HttpCode(200)
  signIn(): { reached: string } {
    return { reached: 'sign-in' };
  }

  @Get(':code')
  redirect(): { reached: string } {
    return { reached: 'redirect' };
  }
}

@Module({
  imports: [AppConfigModule, RedisModule, MetricsModule, RateLimitModule],
  controllers: [ProbeController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
class ProbeModule {}

describe('rate limiting', () => {
  let app: NestExpressApplication;

  /** The whole application, with the given limits and a short window. */
  async function startApplication(limits: Limits): Promise<void> {
    app = await createTestApp((builder) =>
      builder.overrideProvider(RATE_LIMIT_SETTINGS).useValue(settings(limits)),
    );
    await app.get<RedisClient>(REDIS_CLIENT).flushDb();
  }

  async function startProbe(limits: Limits, redisUrl?: string): Promise<void> {
    let builder = Test.createTestingModule({ imports: [ProbeModule] })
      .overrideProvider(RATE_LIMIT_SETTINGS)
      .useValue(settings(limits));
    if (redisUrl !== undefined) {
      builder = builder
        .overrideProvider(REDIS_CLIENT)
        .useValue(createRedisClient(redisUrl));
    }
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
    configureApp(app);
    await app.init();
    if (redisUrl === undefined) {
      await app.get<RedisClient>(REDIS_CLIENT).flushDb();
    }
  }

  const server = () => request(app.getHttpServer());

  afterEach(async () => {
    await app.close();
  });

  describe('on the management API', () => {
    it('answers 429 with Retry-After past the limit, and recovers after the window', async () => {
      await startApplication({ api: 3 });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await server().post(`${SOME_USER}/disable`)).status).toBe(401);
      }
      const refused = await server().post(`${SOME_USER}/disable`);

      expect(refused.status).toBe(429);
      expect(refused.body).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: expect.stringContaining('Too many requests') as string,
      });
      const retryAfter = Number(refused.headers['retry-after']);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(WINDOW_SECONDS);
      expect(refused.headers['x-request-id']).toBeDefined();

      await sleep(WINDOW_MS + 100);
      expect((await server().post(`${SOME_USER}/disable`)).status).toBe(401);
    });

    it('limits before authenticating, so guessing credentials is limited', async () => {
      await startApplication({ api: 1 });

      const first = await server().post(`${SOME_USER}/disable`);
      const second = await server().post(`${SOME_USER}/disable`);

      expect(first.status).toBe(401);
      expect(second.status).toBe(429);
    });

    it('limits each presented credential separately', async () => {
      await startApplication({ credential: 2 });
      const as = (key: string) =>
        server()
          .post(`${SOME_USER}/disable`)
          .set('Authorization', `Bearer ${key}`);

      expect((await as('usk_first')).status).toBe(401);
      expect((await as('usk_first')).status).toBe(401);
      expect((await as('usk_first')).status).toBe(429);

      expect((await as('usk_second')).status).toBe(401);
      const withCookie = await server()
        .post(`${SOME_USER}/disable`)
        .set('Cookie', 'session=some-session-token');
      expect(withCookie.status).toBe(401);
    });

    it('never stores a presented credential in Redis', async () => {
      await startApplication({});

      await server()
        .post(`${SOME_USER}/disable`)
        .set('Authorization', 'Bearer usk_secret_value');

      const keys = await app.get<RedisClient>(REDIS_CLIENT).keys('*');
      expect(keys.some((key) => key.startsWith('ratelimit:credential:'))).toBe(
        true,
      );
      expect(keys.join(' ')).not.toContain('usk_secret_value');
    });

    it('counts the rejection, by policy', async () => {
      await startApplication({ api: 1 });

      await server().post(`${SOME_USER}/disable`);
      await server().post(`${SOME_USER}/disable`);

      const metrics = await server().get('/metrics');
      expect(metrics.text).toContain(
        'rate_limit_rejections_total{policy="api"} 1',
      );
    });

    it('exempts health and metrics', async () => {
      await startApplication({ api: 1, redirect: 1 });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await server().get('/health')).status).toBe(200);
        expect((await server().get('/metrics')).status).toBe(200);
      }
    });

    it('fails closed with 503 when Redis is unavailable', async () => {
      app = await createTestApp((builder) =>
        builder
          .overrideProvider(REDIS_CLIENT)
          .useValue(createRedisClient(UNREACHABLE_REDIS_URL)),
      );

      const response = await server().post(`${SOME_USER}/disable`);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    });
  });

  describe('on the account endpoints', () => {
    it('applies the stricter auth limit on top of the API limit', async () => {
      await startProbe({ auth: 2 });

      expect((await server().post('/api/v1/auth/sign-in')).status).toBe(200);
      expect((await server().post('/api/v1/auth/sign-in')).status).toBe(200);
      const refused = await server().post('/api/v1/auth/sign-in');

      expect(refused.status).toBe(429);
      expect(refused.headers['retry-after']).toBeDefined();
    });

    it('cannot be dodged with another letter case or a trailing slash', async () => {
      await startProbe({ auth: 1 });

      expect((await server().post('/api/v1/auth/sign-in')).status).toBe(200);

      expect((await server().post('/API/V1/AUTH/SIGN-IN')).status).toBe(429);
      expect((await server().post('/api/v1/auth/sign-in/')).status).toBe(429);
    });
  });

  describe('on redirects', () => {
    it('limits by client address, apart from the management API', async () => {
      await startProbe({ redirect: 2, api: 1 });

      expect((await server().get('/abc1234')).status).toBe(200);
      expect((await server().get('/xyz9876')).status).toBe(200);
      const refused = await server().get('/abc1234');

      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(refused.headers['retry-after']).toBeDefined();
      // The redirects used none of the management API's allowance.
      expect((await server().post('/api/v1/auth/sign-in')).status).toBe(200);
    });

    it('recovers after the window', async () => {
      await startProbe({ redirect: 1 });

      expect((await server().get('/abc1234')).status).toBe(200);
      expect((await server().get('/abc1234')).status).toBe(429);

      await sleep(WINDOW_MS + 100);
      expect((await server().get('/abc1234')).status).toBe(200);
    });

    it('fails open when Redis is unavailable', async () => {
      await startProbe({ redirect: 1 }, UNREACHABLE_REDIS_URL);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await server().get('/abc1234')).status).toBe(200);
      }
    });
  });
});
