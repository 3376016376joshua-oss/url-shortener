import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Metrics } from '../../src/common/metrics/metrics.js';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import { Session } from '../../src/database/entities/session.entity.js';
import { User } from '../../src/database/entities/user.entity.js';
import {
  REDIS_CLIENT,
  createRedisClient,
  type RedisClient,
} from '../../src/redis/redis-client.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  APP_ORIGIN,
  PASSWORD,
  as,
  createAccount,
  createIdentityHarness,
  post,
  sessionCookieOf,
  signIn,
  type Account,
  type IdentityHarness,
} from './identity-harness.js';

const WRONG_PASSWORD = 'not the right password';
const LOCK_SECONDS = 15 * 60;
const ADDRESS_FAILURE_LIMIT = 5;
const ACCOUNT_FAILURE_LIMIT = 50;
/** A port nothing listens on, so connections are refused immediately. */
const UNREACHABLE_REDIS_URL = 'redis://localhost:1';

describe('sign-in and sign-out (ID-2, AC-2)', () => {
  let harness: IdentityHarness;
  let account: Account;
  const countSignIn = vi.fn();

  /** Signs in as if the edge had reported this client address. */
  const signInFrom = (address: string, email: string, password: string) =>
    post(harness.app, '/api/v1/auth/sign-in')
      .set('X-Forwarded-For', address)
      .send({ email, password });

  const failFrom = async (address: string, times: number): Promise<void> => {
    for (let attempt = 0; attempt < times; attempt += 1) {
      await signInFrom(address, account.email, WRONG_PASSWORD).expect(401);
    }
  };

  const auditActions = async (): Promise<string[]> => {
    const entries = await harness.app
      .get(DataSource)
      .getRepository(AuditLogEntry)
      .find({ order: { createdAt: 'ASC', id: 'ASC' } });
    return entries.map((entry) => entry.action);
  };

  beforeAll(async () => {
    harness = await createIdentityHarness((builder) =>
      builder.overrideProvider(Metrics).useValue({
        incrementCounter: countSignIn,
        setGauge: () => undefined,
      }),
    );
    // Lets a test choose the client address, as the edge does in production.
    harness.app.set('trust proxy', 1);
  });

  beforeEach(async () => {
    await harness.reset();
    account = await createAccount(harness);
    countSignIn.mockClear();
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('answers 200 with the identity and its workspaces', async () => {
    const response = await signIn(harness.app, account.email, PASSWORD);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      kind: 'session',
      user: {
        id: account.userId,
        email: account.email,
        name: account.name,
        isPlatformAdmin: false,
        createdAt: expect.any(String) as string,
      },
      workspaces: [
        {
          id: account.workspaceId,
          name: `${account.name}'s workspace`,
          slug: expect.stringMatching(
            /^person-\d+-s-workspace-[a-z0-9]{8}$/,
          ) as string,
          role: 'owner',
        },
      ],
    });
    expect(countSignIn).toHaveBeenCalledWith('sign_ins_total', {
      result: 'success',
    });
  });

  it('stores only the hash of the session token', async () => {
    const cookie = sessionCookieOf(
      await signIn(harness.app, account.email, PASSWORD),
    );
    const token = cookie.replace('session=', '');

    const sessions = await harness.app
      .get(DataSource)
      .getRepository(Session)
      .findBy({ userId: account.userId });

    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(session.tokenHash).toHaveLength(32);
      expect(session.tokenHash.toString('base64url')).not.toBe(token);
    }
  });

  it('answers the same 401 for a wrong password, an unknown email, an unverified, a disabled, and a locked account', async () => {
    await post(harness.app, '/api/v1/auth/sign-up').send({
      email: 'unverified@shortener.test',
      name: 'Unverified',
      password: PASSWORD,
    });
    const disabled = await createAccount(harness);
    await harness.app
      .get(DataSource)
      .getRepository(User)
      .update({ id: disabled.userId }, { disabledAt: new Date() });
    await failFrom('203.0.113.50', ADDRESS_FAILURE_LIMIT);

    const responses = await Promise.all([
      signIn(harness.app, account.email, WRONG_PASSWORD),
      signIn(harness.app, 'nobody@shortener.test', PASSWORD),
      signIn(harness.app, 'unverified@shortener.test', PASSWORD),
      signIn(harness.app, disabled.email, PASSWORD),
      signInFrom('203.0.113.50', account.email, PASSWORD),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'UNAUTHENTICATED',
        message: 'Wrong email or password',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('refuses the sixth attempt from one address even with the right password, while another address still signs in', async () => {
    await failFrom('203.0.113.7', ADDRESS_FAILURE_LIMIT);

    const sameAddress = await signInFrom(
      '203.0.113.7',
      account.email,
      PASSWORD,
    );
    const otherAddress = await signInFrom(
      '203.0.113.8',
      account.email,
      PASSWORD,
    );

    expect(sameAddress.status).toBe(401);
    expect(otherAddress.status).toBe(200);
    expect(countSignIn).toHaveBeenCalledWith('sign_ins_total', {
      result: 'locked',
    });
    expect(countSignIn).toHaveBeenCalledWith('sign_ins_total', {
      result: 'failure',
    });
  });

  it('locks an address for 15 minutes and audits the burst', async () => {
    await failFrom('203.0.113.7', ADDRESS_FAILURE_LIMIT);

    const redis = harness.app.get<RedisClient>(REDIS_CLIENT);
    const [lockKey] = await redis.keys('signin:*:lock:203.0.113.7');
    const ttl = await redis.ttl(lockKey ?? '');

    expect(ttl).toBeGreaterThan(LOCK_SECONDS - 10);
    expect(ttl).toBeLessThanOrEqual(LOCK_SECONDS);
    const locked = await harness.app
      .get(DataSource)
      .getRepository(AuditLogEntry)
      .findOneByOrFail({ action: 'user.sign_in_locked' });
    expect(locked).toMatchObject({
      workspaceId: account.workspaceId,
      actorType: 'system',
      actorId: null,
      targetType: 'user',
      targetId: account.userId,
      metadata: { scope: 'address' },
    });
  });

  it('forgives earlier failures after a successful sign-in', async () => {
    await failFrom('203.0.113.7', ADDRESS_FAILURE_LIMIT - 1);
    await signInFrom('203.0.113.7', account.email, PASSWORD).expect(200);
    await failFrom('203.0.113.7', ADDRESS_FAILURE_LIMIT - 1);

    const response = await signInFrom('203.0.113.7', account.email, PASSWORD);

    expect(response.status).toBe(200);
  });

  it('locks the account for every address after 50 failures from anywhere', async () => {
    for (let attempt = 0; attempt < ACCOUNT_FAILURE_LIMIT; attempt += 1) {
      await failFrom(`198.51.100.${attempt + 1}`, 1);
    }

    const response = await signInFrom('203.0.113.200', account.email, PASSWORD);

    expect(response.status).toBe(401);
    const locks = await harness.app
      .get(DataSource)
      .getRepository(AuditLogEntry)
      .findBy({ action: 'user.sign_in_locked' });
    expect(locks.map((entry) => entry.metadata)).toEqual([
      { scope: 'account' },
    ]);
  });

  it('does not let failures against one account lock another', async () => {
    const other = await createAccount(harness);
    await failFrom('203.0.113.7', ADDRESS_FAILURE_LIMIT);

    const response = await signInFrom('203.0.113.7', other.email, PASSWORD);

    expect(response.status).toBe(200);
  });

  it('signs out: revokes the session, clears the cookie, and audits both ends', async () => {
    const client = as(harness.app, account.cookie);

    const response = await client.post('/api/v1/auth/sign-out');

    expect(response.status).toBe(204);
    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^session=;/);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect((await client.get('/api/v1/me')).status).toBe(401);
    expect(await auditActions()).toEqual([
      'workspace.created',
      'user.signed_in',
      'user.signed_out',
    ]);
  });

  it('answers 401 to sign-out without a session', async () => {
    const response = await post(harness.app, '/api/v1/auth/sign-out');

    expect(response.status).toBe(401);
  });

  it('ends the sessions of an account a platform admin disables', async () => {
    const client = as(harness.app, account.cookie);
    await client.get('/api/v1/me').expect(200);

    await harness.app
      .get(DataSource)
      .getRepository(User)
      .update({ id: account.userId }, { disabledAt: new Date() });

    expect((await client.get('/api/v1/me')).status).toBe(401);
  });

  it.each([
    ['a missing password', { email: 'ada@shortener.test' }],
    ['a malformed email', { email: 'ada', password: PASSWORD }],
    ['an unknown property', { email: 'a@b.test', password: PASSWORD, x: 1 }],
  ])('answers 400 for %s', async (_case, body) => {
    const response = await post(harness.app, '/api/v1/auth/sign-in').send(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  describe('with Redis down', () => {
    let degraded: NestExpressApplication;

    beforeAll(async () => {
      degraded = await createTestApp((builder) =>
        builder
          .overrideProvider(REDIS_CLIENT)
          .useValue(createRedisClient(UNREACHABLE_REDIS_URL)),
      );
    });

    afterAll(async () => {
      await degraded.close();
    });

    it('refuses sign-in with 503 rather than leaving it unguarded', async () => {
      const response = await request(degraded.getHttpServer())
        .post('/api/v1/auth/sign-in')
        .set('Origin', APP_ORIGIN)
        .send({ email: account.email, password: PASSWORD });

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('refuses to send mail it cannot throttle', async () => {
      const response = await request(degraded.getHttpServer())
        .post('/api/v1/auth/sign-up')
        .send({ email: 'new@shortener.test', name: 'New', password: PASSWORD });

      expect(response.status).toBe(503);
    });

    it('still authenticates an existing session from Postgres', async () => {
      const response = await request(degraded.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', account.cookie);

      expect(response.status).toBe(200);
    });
  });
});
