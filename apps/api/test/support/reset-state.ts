import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../src/redis/redis-client.js';
import { TEST_DATABASE_NAME } from './test-env.js';

/**
 * The shared client gives every command 100 ms, which is right for a redirect
 * but too tight for a flush on a busy development machine or CI runner.
 */
const FLUSH_TIMEOUT_MS = 5_000;

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

  const tables = dataSource.entityMetadatas
    .map(({ tableName }) => `"${tableName}"`)
    .join(', ');
  await dataSource.query(`TRUNCATE TABLE ${tables} CASCADE`);
  await app
    .get<RedisClient>(REDIS_CLIENT)
    .withCommandOptions({ timeout: FLUSH_TIMEOUT_MS })
    .flushDb();
}
