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

/** Far above anything a suite does, so no test trips a limit by accident. */
const UNLIMITED = '1000000';

export const testEnv = {
  NODE_ENV: 'test',
  // No background work during tests: a test runs a job when it means to.
  PROCESS_ROLE: 'web',
  DATABASE_URL: `${postgresServer}/${TEST_DATABASE_NAME}`,
  REDIS_URL: `redis://localhost:${redisPort}/${TEST_REDIS_DATABASE}`,
  APP_URL: 'http://app.shortener.test',
  DEFAULT_SHORT_DOMAIN: 'sho.test',
  CNAME_TARGET: 'cname.sho.test',
  APP_SECRET: 'test-secret-that-is-at-least-32-characters',
  // Nothing listens here: a test that needs mail replaces the mailer.
  SMTP_URL: 'smtp://localhost:1',
  MAIL_FROM: 'no-reply@shortener.test',
  // The rate-limit tests set their own small limits.
  RATE_LIMIT_REDIRECT_PER_MINUTE: UNLIMITED,
  RATE_LIMIT_API_PER_MINUTE: UNLIMITED,
  RATE_LIMIT_CREDENTIAL_PER_MINUTE: UNLIMITED,
  RATE_LIMIT_AUTH_PER_MINUTE: UNLIMITED,
};
