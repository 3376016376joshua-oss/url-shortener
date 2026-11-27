import { createClient } from 'redis';
import { DataSource, type QueryRunner } from 'typeorm';
import { runPendingMigrations } from '../../src/database/migrate.js';
import {
  MAINTENANCE_DATABASE_URL,
  TEST_DATABASE_NAME,
  testEnv,
} from './test-env.js';

/** Any fixed number: every run asks Postgres for the same advisory lock. */
const E2E_RUN_LOCK = 7_267_101;

async function recreateTestDatabase(session: QueryRunner): Promise<void> {
  await session.query(
    `DROP DATABASE IF EXISTS "${TEST_DATABASE_NAME}" WITH (FORCE)`,
  );
  await session.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
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
 * Runs once before the end-to-end suite and returns its teardown.
 *
 * Every run starts from an empty database built by the migrations, so the
 * migrations are tested from zero and no run can be affected by an earlier
 * one. Because that is destructive, a run holds a Postgres advisory lock from
 * start to finish: two runs against the same Postgres (two checkouts sharing
 * one Compose project, say) take turns instead of destroying each other.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const maintenance = new DataSource({
    type: 'postgres',
    url: MAINTENANCE_DATABASE_URL,
  });
  await maintenance.initialize();
  const session = maintenance.createQueryRunner();
  const releaseLock = async (): Promise<void> => {
    // Closing the session is what releases the lock.
    await session.release();
    await maintenance.destroy();
  };

  try {
    await session.connect();
    await session.query('SELECT pg_advisory_lock($1)', [E2E_RUN_LOCK]);
    await recreateTestDatabase(session);
    await runPendingMigrations(testEnv.DATABASE_URL);
    await flushTestRedis();
  } catch (error) {
    await releaseLock();
    throw error;
  }
  return releaseLock;
}
