/**
 * Where the end-to-end tests find Postgres and Redis: the Docker Compose
 * services, on the same POSTGRES_PORT / REDIS_PORT overrides Compose honours.
 * Tests get their own database and their own Redis logical database, so they
 * can reset state freely without touching development data.
 */
const postgresPort = process.env.POSTGRES_PORT ?? '5432';
const redisPort = process.env.REDIS_PORT ?? '6379';
const postgresServer = `postgres://shortener:shortener@localhost:${postgresPort}`;

export const TEST_DATABASE_NAME = 'shortener_test';
const TEST_REDIS_DATABASE = 1;

/** A database that always exists, used only to create the test database. */
export const MAINTENANCE_DATABASE_URL = `${postgresServer}/postgres`;

export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: `${postgresServer}/${TEST_DATABASE_NAME}`,
  REDIS_URL: `redis://localhost:${redisPort}/${TEST_REDIS_DATABASE}`,
  BASE_URL: 'http://sho.rt.test',
  // High enough that no suite trips a limit by accident. The rate-limit
  // tests set their own small limits.
  RATE_LIMIT_REDIRECT_PER_MINUTE: '1000000',
  RATE_LIMIT_API_PER_MINUTE: '1000000',
  RATE_LIMIT_CREATE_ANON_PER_MINUTE: '1000000',
  RATE_LIMIT_API_KEY_PER_MINUTE: '1000000',
};
