import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis-client.js';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'unavailable';
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
    const ready = postgres === 'up' && redis === 'up';
    return {
      status: ready ? 'ok' : 'unavailable',
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
