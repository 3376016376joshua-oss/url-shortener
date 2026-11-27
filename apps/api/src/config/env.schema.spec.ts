import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema.js';

const REQUIRED = {
  DATABASE_URL: 'postgres://user:secret@db:5432/shortener',
  REDIS_URL: 'redis://cache:6379',
  APP_URL: 'https://app.example.com',
  DEFAULT_SHORT_DOMAIN: 'sho.rt',
  CNAME_TARGET: 'cname.sho.rt',
  APP_SECRET: 'a'.repeat(32),
  SMTP_URL: 'smtp://mail:1025',
  MAIL_FROM: 'no-reply@example.com',
};

describe('envSchema', () => {
  it('fills in defaults when only the required variables are set', () => {
    expect(envSchema.parse(REQUIRED)).toEqual({
      ...REQUIRED,
      NODE_ENV: 'development',
      PORT: 3000,
      PROCESS_ROLE: 'all',
      TRUST_PROXY_HOPS: 0,
      BLOCKED_HOSTS: [],
      RATE_LIMIT_REDIRECT_PER_MINUTE: 600,
      RATE_LIMIT_API_PER_MINUTE: 300,
      RATE_LIMIT_CREDENTIAL_PER_MINUTE: 600,
      RATE_LIMIT_AUTH_PER_MINUTE: 10,
    });
  });

  it.each(Object.keys(REQUIRED))('rejects a missing %s', (name) => {
    const env: Record<string, string> = { ...REQUIRED };
    delete env[name];

    expect(envSchema.safeParse(env).success).toBe(false);
  });

  it('converts numeric variables from their string form', () => {
    const env = envSchema.parse({
      ...REQUIRED,
      PORT: '8080',
      TRUST_PROXY_HOPS: '2',
      RATE_LIMIT_AUTH_PER_MINUTE: '25',
    });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY_HOPS).toBe(2);
    expect(env.RATE_LIMIT_AUTH_PER_MINUTE).toBe(25);
  });

  it('removes trailing slashes from APP_URL so paths join cleanly', () => {
    const env = envSchema.parse({ ...REQUIRED, APP_URL: 'https://app.io/' });

    expect(env.APP_URL).toBe('https://app.io');
  });

  it('lowercases host names', () => {
    const env = envSchema.parse({
      ...REQUIRED,
      DEFAULT_SHORT_DOMAIN: 'Sho.RT',
      BLOCKED_HOSTS: 'Evil.example, phishing.test',
    });

    expect(env.DEFAULT_SHORT_DOMAIN).toBe('sho.rt');
    expect(env.BLOCKED_HOSTS).toEqual(['evil.example', 'phishing.test']);
  });

  it.each([
    ['DATABASE_URL that is not a Postgres URL', { DATABASE_URL: 'mysql://d' }],
    ['REDIS_URL that is not a Redis URL', { REDIS_URL: 'http://cache:6379' }],
    ['APP_URL that is not http(s)', { APP_URL: 'ftp://app.example.com' }],
    ['SMTP_URL that is not SMTP', { SMTP_URL: 'http://mail:1025' }],
    ['MAIL_FROM that is not an address', { MAIL_FROM: 'nobody' }],
    ['short domain with a scheme', { DEFAULT_SHORT_DOMAIN: 'https://sho.rt' }],
    ['short domain with a port', { DEFAULT_SHORT_DOMAIN: 'sho.rt:8080' }],
    ['CNAME target with a path', { CNAME_TARGET: 'cname.sho.rt/x' }],
    ['APP_SECRET shorter than 32 characters', { APP_SECRET: 'short' }],
    ['blocked host with a path', { BLOCKED_HOSTS: 'evil.example/path' }],
    ['PORT that is not a number', { PORT: 'http' }],
    ['PORT out of range', { PORT: '70000' }],
    ['negative TRUST_PROXY_HOPS', { TRUST_PROXY_HOPS: '-1' }],
    ['unknown NODE_ENV', { NODE_ENV: 'staging' }],
    ['unknown PROCESS_ROLE', { PROCESS_ROLE: 'cron' }],
    ['rate limit of zero', { RATE_LIMIT_API_PER_MINUTE: '0' }],
  ])('rejects a %s', (_reason, override) => {
    expect(envSchema.safeParse({ ...REQUIRED, ...override }).success).toBe(
      false,
    );
  });

  it('accepts the postgresql://, rediss://, and smtps:// spellings', () => {
    const result = envSchema.safeParse({
      ...REQUIRED,
      DATABASE_URL: 'postgresql://user:secret@db:5432/shortener',
      REDIS_URL: 'rediss://cache:6380',
      SMTP_URL: 'smtps://user:secret@mail.example.com:465',
    });

    expect(result.success).toBe(true);
  });
});
