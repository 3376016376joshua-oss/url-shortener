import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../src/redis/redis-client.js';
import { TEST_DATABASE_NAME } from './test-env.js';

/**
 * Empties Postgres and Redis between tests. Refuses to run against anything
 * but the test database, because it destroys every row.
 */
export async function resetState(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const database = dataSource.driver.database;
  if (database !== TEST_DATABASE_NAME) {
    throw new Error(`Refusing to reset database "${String(database)}"`);
  }

  await dataSource.query(
    'TRUNCATE TABLE "url_mappings" RESTART IDENTITY CASCADE',
  );
  await app.get<RedisClient>(REDIS_CLIENT).flushDb();
}
