import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RedisClient } from '../redis/redis-client.js';
import { HealthService } from './health.service.js';

function createService(probes: {
  postgres: () => Promise<unknown>;
  redis: () => Promise<unknown>;
}): HealthService {
  const dataSource = { query: probes.postgres } as unknown as DataSource;
  const redis = { ping: probes.redis } as unknown as RedisClient;
  return new HealthService(dataSource, redis);
}

const up = () => Promise.resolve('ok');
const down = () => Promise.reject(new Error('connection refused'));

describe('HealthService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('is ready when Postgres and Redis both answer', async () => {
    const service = createService({ postgres: up, redis: up });

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('is degraded and names Postgres when only Postgres is down', async () => {
    const service = createService({ postgres: down, redis: up });

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'degraded',
      checks: { postgres: 'down', redis: 'up' },
    });
  });

  it('is degraded and names Redis when only Redis is down', async () => {
    const service = createService({ postgres: up, redis: down });

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'degraded',
      checks: { postgres: 'up', redis: 'down' },
    });
  });

  it('is unavailable when both are down', async () => {
    const service = createService({ postgres: down, redis: down });

    await expect(service.checkReadiness()).resolves.toEqual({
      status: 'unavailable',
      checks: { postgres: 'down', redis: 'down' },
    });
  });
});
