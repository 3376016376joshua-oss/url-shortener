import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis-client.js';

export type DependencyStatus = 'up' | 'down';

/**
 * `degraded` means one dependency is down and the application still serves
 * what it can: redirects from Postgres without Redis, or cached redirects
 * without Postgres. `unavailable` means it can serve nothing.
 */
export type ReadinessStatus = 'ok' | 'degraded' | 'unavailable';

export interface ReadinessReport {
  status: ReadinessStatus;
  checks: { postgres: DependencyStatus; redis: DependencyStatus };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async checkReadiness(): Promise<ReadinessReport> {
    const [postgres, redis] = await Promise.all([
      this.probe('postgres', () => this.dataSource.query('SELECT 1')),
      this.probe('redis', () => this.redis.ping()),
    ]);
    return {
      status: summarise([postgres, redis]),
      checks: { postgres, redis },
    };
  }

  private async probe(
    dependency: string,
    ping: () => Promise<unknown>,
  ): Promise<DependencyStatus> {
    try {
      await ping();
      return 'up';
    } catch (error) {
      this.logger.warn(`${dependency} is not reachable: ${String(error)}`);
      return 'down';
    }
  }
}

function summarise(dependencies: DependencyStatus[]): ReadinessStatus {
  const down = dependencies.filter((status) => status === 'down').length;
  if (down === 0) {
    return 'ok';
  }
  return down === dependencies.length ? 'unavailable' : 'degraded';
}
