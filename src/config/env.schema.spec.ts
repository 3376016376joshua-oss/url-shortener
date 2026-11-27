import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema.js';

const KEY_A = 'k1-aaaaaaaaaaaaaaaa';
const KEY_B = 'k2-bbbbbbbbbbbbbbbb';
const KEY_C = 'k3-cccccccccccccccc';

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
      API_KEYS: [],
      BLOCKED_HOSTS: [],
      RATE_LIMIT_REDIRECT_PER_MINUTE: 300,
      RATE_LIMIT_API_PER_MINUTE: 120,
      RATE_LIMIT_CREATE_ANON_PER_MINUTE: 10,
      RATE_LIMIT_API_KEY_PER_MINUTE: 300,
    });
  });

  it('parses API_KEYS into owner and key pairs', () => {
    const env = envSchema.parse({
      ...REQUIRED,
      API_KEYS: `alice:${KEY_A}, bob:${KEY_B},alice:${KEY_C}`,
    });

    expect(env.API_KEYS).toEqual([
      { ownerId: 'alice', key: KEY_A },
      { ownerId: 'bob', key: KEY_B },
      { ownerId: 'alice', key: KEY_C },
    ]);
  });

  it.each([
    ['an entry without an owner', KEY_A],
    ['a key shorter than 16 characters', 'alice:short'],
    ['an owner id with a space', `al ice:${KEY_A}`],
    ['the same key for two owners', `alice:${KEY_A},bob:${KEY_A}`],
  ])('rejects API_KEYS with %s', (_reason, value) => {
    const result = envSchema.safeParse({ ...REQUIRED, API_KEYS: value });

    expect(result.success).toBe(false);
  });

  it('does not repeat a rejected API key in the error', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      API_KEYS: `alice:${KEY_A},bob:${KEY_A}`,
    });

    expect(JSON.stringify(result.error)).not.toContain(KEY_A);
  });

  it('parses BLOCKED_HOSTS into lowercase host names', () => {
    const env = envSchema.parse({
      ...REQUIRED,
      BLOCKED_HOSTS: 'Evil.example, phishing.test',
    });

    expect(env.BLOCKED_HOSTS).toEqual(['evil.example', 'phishing.test']);
  });

  it.each(['https://evil.example', 'evil.example/path', 'evil_host'])(
    'rejects the blocked host %s',
    (host) => {
      const result = envSchema.safeParse({ ...REQUIRED, BLOCKED_HOSTS: host });

      expect(result.success).toBe(false);
    },
  );

  it('reads a rate limit from the environment', () => {
    const env = envSchema.parse({
      ...REQUIRED,
      RATE_LIMIT_CREATE_ANON_PER_MINUTE: '25',
    });

    expect(env.RATE_LIMIT_CREATE_ANON_PER_MINUTE).toBe(25);
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
    ['rate limit of zero', { RATE_LIMIT_API_PER_MINUTE: '0' }],
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
