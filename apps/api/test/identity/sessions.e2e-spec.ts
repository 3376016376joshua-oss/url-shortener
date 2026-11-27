import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import { EmailToken } from '../../src/database/entities/email-token.entity.js';
import { Session } from '../../src/database/entities/session.entity.js';
import { ExpiredCredentialsJob } from '../../src/identity/expired-credentials.job.js';
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

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const NEW_PASSWORD = 'a brand new password';
const NO_SUCH_ID = '0193d2a0-0000-7000-8000-000000000000';

describe('sessions and the signed-in account (ID-2, ID-4, AC-49)', () => {
  let harness: IdentityHarness;
  let account: Account;

  const me = (cookie: string) => as(harness.app, cookie).get('/api/v1/me');
  const sessionRows = (): Promise<Session[]> =>
    harness.app
      .get(DataSource)
      .getRepository(Session)
      .find({ order: { createdAt: 'ASC', id: 'ASC' } });

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    account = await createAccount(harness);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  describe('lifetime', () => {
    it('ends a session after 14 days without use', async () => {
      harness.clock.advance(14 * DAY_MS - MINUTE_MS);
      expect((await me(account.cookie)).status).toBe(200);

      harness.clock.advance(14 * DAY_MS + MINUTE_MS);

      expect((await me(account.cookie)).status).toBe(401);
    });

    it('ends a session 90 days after sign-in, however often it is used', async () => {
      for (let day = 10; day < 90; day += 10) {
        harness.clock.advance(10 * DAY_MS);
        expect((await me(account.cookie)).status).toBe(200);
      }

      harness.clock.advance(10 * DAY_MS + MINUTE_MS);

      expect((await me(account.cookie)).status).toBe(401);
      expect(await sessionRows()).toHaveLength(0);
    });

    it('records use at most once a minute', async () => {
      const [before] = await sessionRows();
      harness.clock.advance(MINUTE_MS / 2);
      await me(account.cookie);
      const [withinTheMinute] = await sessionRows();

      harness.clock.advance(MINUTE_MS);
      await me(account.cookie);
      const [afterTheMinute] = await sessionRows();

      expect(withinTheMinute?.lastSeenAt).toEqual(before?.lastSeenAt);
      expect(afterTheMinute?.lastSeenAt.getTime()).toBeGreaterThan(
        before?.lastSeenAt.getTime() ?? Infinity,
      );
    });

    it('purges expired sessions and mailed tokens with the daily job', async () => {
      const dataSource = harness.app.get(DataSource);
      await post(harness.app, '/api/v1/auth/password-reset').send({
        email: account.email,
      });
      const fresh = await createAccount(harness);
      harness.clock.advance(15 * DAY_MS);
      await signIn(harness.app, fresh.email, PASSWORD);

      await harness.app.get(ExpiredCredentialsJob).run();

      const sessions = await sessionRows();
      expect(sessions.map((session) => session.userId)).toEqual([fresh.userId]);
      expect(await dataSource.getRepository(EmailToken).count()).toBe(0);
    });
  });

  describe('cross-site request forgery', () => {
    it.each([
      ['no Origin', undefined],
      ['another site as Origin', 'https://evil.example'],
      ['the app host on another scheme', APP_ORIGIN.replace('http:', 'https:')],
    ])('refuses a cookie-authenticated POST with %s', async (_case, origin) => {
      const attempt = request(harness.app.getHttpServer())
        .post('/api/v1/auth/sign-out')
        .set('Cookie', account.cookie);
      if (origin !== undefined) {
        void attempt.set('Origin', origin);
      }

      const response = await attempt;

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
      expect((await me(account.cookie)).status).toBe(200);
    });

    it('needs no Origin for a request that changes nothing', async () => {
      const response = await request(harness.app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', account.cookie);

      expect(response.status).toBe(200);
    });
  });

  describe('GET and PATCH /me', () => {
    it('answers 401 without credentials', async () => {
      const response = await request(harness.app.getHttpServer()).get(
        '/api/v1/me',
      );

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('changes the name', async () => {
      const response = await as(harness.app, account.cookie)
        .patch('/api/v1/me')
        .send({ name: '  Grace Hopper ' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ user: { name: 'Grace Hopper' } });
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('changes the password, revokes every session, and keeps the caller signed in', async () => {
      const other = sessionCookieOf(
        await signIn(harness.app, account.email, PASSWORD),
      );

      const response = await as(harness.app, account.cookie)
        .patch('/api/v1/me')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

      expect(response.status).toBe(200);
      const replacement = sessionCookieOf(response);
      expect((await me(replacement)).status).toBe(200);
      expect((await me(account.cookie)).status).toBe(401);
      expect((await me(other)).status).toBe(401);
      expect((await signIn(harness.app, account.email, PASSWORD)).status).toBe(
        401,
      );
      expect(
        (await signIn(harness.app, account.email, NEW_PASSWORD)).status,
      ).toBe(200);
      const audit = await harness.app
        .get(DataSource)
        .getRepository(AuditLogEntry)
        .findOneBy({ action: 'user.password_changed' });
      expect(audit).toMatchObject({ actorId: account.userId });
    });

    it('refuses a password change with the wrong current password', async () => {
      const response = await as(harness.app, account.cookie)
        .patch('/api/v1/me')
        .send({
          currentPassword: 'not my password',
          newPassword: NEW_PASSWORD,
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect((await me(account.cookie)).status).toBe(200);
    });

    it.each([
      ['an empty body', {}],
      ['a new password without the current one', { newPassword: NEW_PASSWORD }],
      ['a current password alone', { currentPassword: PASSWORD }],
      ['a short new password', { currentPassword: PASSWORD, newPassword: 'x' }],
      ['an email, which cannot be changed', { email: 'new@shortener.test' }],
    ])('answers 400 for %s', async (_case, body) => {
      const response = await as(harness.app, account.cookie)
        .patch('/api/v1/me')
        .send(body);

      expect(response.status).toBe(400);
    });
  });

  describe('GET and DELETE /me/sessions', () => {
    it('lists the live sessions and marks the current one', async () => {
      const second = await post(harness.app, '/api/v1/auth/sign-in')
        .set('User-Agent', 'Second Browser/1.0')
        .send({ email: account.email, password: PASSWORD });

      const response = await as(harness.app, sessionCookieOf(second)).get(
        '/api/v1/me/sessions',
      );

      expect(response.status).toBe(200);
      const body = response.body as {
        items: Array<{ userAgent: string | null; current: boolean }>;
        nextCursor: null;
      };
      expect(body.nextCursor).toBeNull();
      expect(body.items).toHaveLength(2);
      expect(body.items.filter((session) => session.current)).toEqual([
        expect.objectContaining({ userAgent: 'Second Browser/1.0' }),
      ]);
      expect(JSON.stringify(body)).not.toContain('token');
    });

    it('revokes another session at once', async () => {
      const other = sessionCookieOf(
        await signIn(harness.app, account.email, PASSWORD),
      );
      const [first] = await sessionRows();

      const response = await as(harness.app, other).delete(
        `/api/v1/me/sessions/${first?.id}`,
      );

      expect(response.status).toBe(204);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect((await me(account.cookie)).status).toBe(401);
      expect((await me(other)).status).toBe(200);
    });

    it('clears the cookie when the current session is revoked', async () => {
      const [current] = await sessionRows();

      const response = await as(harness.app, account.cookie).delete(
        `/api/v1/me/sessions/${current?.id}`,
      );

      expect(response.status).toBe(204);
      expect(String(response.headers['set-cookie'])).toMatch(/^session=;/);
      expect((await me(account.cookie)).status).toBe(401);
    });

    it("answers 404 for an unknown session and for someone else's", async () => {
      const stranger = await createAccount(harness);
      const [mine] = await sessionRows();

      const unknown = await as(harness.app, account.cookie).delete(
        `/api/v1/me/sessions/${NO_SUCH_ID}`,
      );
      const foreign = await as(harness.app, stranger.cookie).delete(
        `/api/v1/me/sessions/${mine?.id}`,
      );

      expect([unknown.status, foreign.status]).toEqual([404, 404]);
      expect((await me(account.cookie)).status).toBe(200);
    });

    it('answers 400 for a session id that is not a UUID', async () => {
      const response = await as(harness.app, account.cookie).delete(
        '/api/v1/me/sessions/not-a-uuid',
      );

      expect(response.status).toBe(400);
    });
  });
});
