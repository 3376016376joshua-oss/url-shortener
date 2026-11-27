import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema.js';

const REQUIRED = {
  DATABASE_URL: 'postgres://user:secret@db:5432/shortener',
  REDIS_URL: 'redis://cache:6379',
};

describe('envSchema', () => {
  it('fills in defaults when only the required variables are set', () => {
    expect(envSchema.parse(REQUIRED)).toEqual({
      ...REQUIRED,
      NODE_ENV: 'development',
      PORT: 3000,
      BASE_URL: 'http://localhost:3000',
      TRUST_PROXY_HOPS: 0,
      API_KEYS: '',
      BLOCKED_HOSTS: '',
    });
  });

  it('converts numeric variables from their string form', () => {
    const env = envSchema.parse({
      ...REQUIRED,
      PORT: '8080',
      TRUST_PROXY_HOPS: '2',
    });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY_HOPS).toBe(2);
  });

  it('removes trailing slashes from BASE_URL so short URLs join cleanly', () => {
    const env = envSchema.parse({ ...REQUIRED, BASE_URL: 'https://sho.rt/' });

    expect(env.BASE_URL).toBe('https://sho.rt');
  });

  it.each(['DATABASE_URL', 'REDIS_URL'] as const)(
    'rejects a missing %s',
    (name) => {
      const env: Record<string, string> = { ...REQUIRED };
      delete env[name];

      expect(envSchema.safeParse(env).success).toBe(false);
    },
  );

  it.each([
    [
      'DATABASE_URL that is not a Postgres URL',
      { DATABASE_URL: 'mysql://db/x' },
    ],
    ['REDIS_URL that is not a Redis URL', { REDIS_URL: 'http://cache:6379' }],
    ['BASE_URL that is not http(s)', { BASE_URL: 'ftp://sho.rt' }],
    ['PORT that is not a number', { PORT: 'http' }],
    ['PORT out of range', { PORT: '70000' }],
    ['negative TRUST_PROXY_HOPS', { TRUST_PROXY_HOPS: '-1' }],
    ['unknown NODE_ENV', { NODE_ENV: 'staging' }],
  ])('rejects a %s', (_reason, override) => {
    expect(envSchema.safeParse({ ...REQUIRED, ...override }).success).toBe(
      false,
    );
  });

  it('accepts the postgresql:// and rediss:// spellings', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:secret@db:5432/shortener',
      REDIS_URL: 'rediss://cache:6380',
    });

    expect(result.success).toBe(true);
  });
});
