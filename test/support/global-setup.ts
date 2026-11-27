import { createClient } from 'redis';
import { DataSource } from 'typeorm';
import { runPendingMigrations } from '../../src/database/migrate.js';
import {
  MAINTENANCE_DATABASE_URL,
  TEST_DATABASE_NAME,
  testEnv,
} from './test-env.js';

async function recreateTestDatabase(): Promise<void> {
  const maintenance = new DataSource({
    type: 'postgres',
    url: MAINTENANCE_DATABASE_URL,
  });
  await maintenance.initialize();
  try {
    await maintenance.query(
      `DROP DATABASE IF EXISTS "${TEST_DATABASE_NAME}" WITH (FORCE)`,
    );
    await maintenance.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
  } finally {
    await maintenance.destroy();
  }
}

async function flushTestRedis(): Promise<void> {
  const redis = createClient({ url: testEnv.REDIS_URL });
  await redis.connect();
  try {
    await redis.flushDb();
  } finally {
    redis.destroy();
  }
}

/**
 * Runs once before the end-to-end suite. Every run starts from an empty
 * database built by the migrations, so the migrations are tested from zero
 * and no run can be affected by what an earlier one left behind.
 */
export default async function setup(): Promise<void> {
  await recreateTestDatabase();
  await runPendingMigrations(testEnv.DATABASE_URL);
  await flushTestRedis();
}
