import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS_CLIENT, createRedisClient } from '../src/redis/redis-client.js';
import { createTestApp } from './support/create-test-app.js';

/** A port nothing listens on, so connections are refused immediately. */
const UNREACHABLE_REDIS_URL = 'redis://localhost:1';

describe('health endpoints', () => {
  describe('with Postgres and Redis up', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /health reports the process is live', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('GET /health/ready reports both dependencies up', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        checks: { postgres: 'up', redis: 'up' },
      });
    });

    it('does not advertise the web framework', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.headers).not.toHaveProperty('x-powered-by');
    });
  });

  describe('with Redis down', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp((builder) =>
        builder
          .overrideProvider(REDIS_CLIENT)
          .useValue(createRedisClient(UNREACHABLE_REDIS_URL)),
      );
    });

    afterAll(async () => {
      await app.close();
    });

    it('still starts, and stays live', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
    });

    it('GET /health/ready answers 503 and names Redis', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        status: 'unavailable',
        checks: { postgres: 'up', redis: 'down' },
      });
    });
  });
});
