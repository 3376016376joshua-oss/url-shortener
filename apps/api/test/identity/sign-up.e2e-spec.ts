import type { Identity } from '@url-shortener/contracts/identity';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import { User } from '../../src/database/entities/user.entity.js';
import {
  APP_ORIGIN,
  PASSWORD,
  as,
  createAccount,
  createIdentityHarness,
  post,
  sessionCookieOf,
  signIn,
  type IdentityHarness,
} from './identity-harness.js';

const HOUR_MS = 3_600_000;
const EMAIL = 'ada@shortener.test';
const SIGN_UP = { email: EMAIL, name: 'Ada Lovelace', password: PASSWORD };

describe('sign-up and email verification (ID-1, ID-5, AC-1)', () => {
  let harness: IdentityHarness;

  const signUp = (body: Record<string, unknown> = SIGN_UP) =>
    post(harness.app, '/api/v1/auth/sign-up').send(body);
  const verify = (token: string) =>
    post(harness.app, '/api/v1/auth/verify-email').send({ token });
  const resend = (email: string) =>
    post(harness.app, '/api/v1/auth/verify-email/resend').send({ email });

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });

  beforeEach(() => harness.reset());

  afterAll(async () => {
    await harness.app.close();
  });

  it('answers 202 and mails a verification link to a new address', async () => {
    const response = await signUp();

    expect(response.status).toBe(202);
    expect(response.body).toEqual({});
    const [mail] = harness.mailer.to(EMAIL);
    expect(mail?.subject).toBe('Confirm your email address');
    expect(mail?.text).toContain(`${APP_ORIGIN}/verify-email?token=`);
  });

  it('refuses sign-in until the mailed link is followed', async () => {
    await signUp();

    const before = await signIn(harness.app, EMAIL, PASSWORD);
    await verify(harness.mailer.latestToken(EMAIL)).expect(204);
    const after = await signIn(harness.app, EMAIL, PASSWORD);

    expect(before.status).toBe(401);
    expect(before.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(after.status).toBe(200);
  });

  it('sets an HttpOnly, SameSite=Lax, host-only session cookie on sign-in', async () => {
    await signUp();
    await verify(harness.mailer.latestToken(EMAIL));

    const response = await signIn(harness.app, EMAIL, PASSWORD);

    const [cookie] = response.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
    // The test app is served over plain HTTP; HTTPS deployments add Secure.
    expect(cookie).not.toContain('Secure');
  });

  it('accepts mixed-case email and stores it lowercase', async () => {
    await signUp({ ...SIGN_UP, email: '  Ada@Shortener.TEST ' }).expect(202);
    await verify(harness.mailer.latestToken(EMAIL)).expect(204);

    const response = await signIn(harness.app, 'ADA@shortener.test', PASSWORD);

    expect(response.status).toBe(200);
    expect((response.body as Identity).kind).toBe('session');
  });

  it('gives a verified account a first workspace that it owns', async () => {
    const account = await createAccount(harness, {
      email: EMAIL,
      name: 'Ada Lovelace',
    });

    const response = await as(harness.app, account.cookie).get('/api/v1/me');

    expect(response.body).toMatchObject({
      kind: 'session',
      user: { email: EMAIL, name: 'Ada Lovelace', isPlatformAdmin: false },
      workspaces: [{ name: "Ada Lovelace's workspace", role: 'owner' }],
    });
    const audit = await harness.app
      .get(DataSource)
      .getRepository(AuditLogEntry)
      .findOneBy({ action: 'workspace.created' });
    expect(audit).toMatchObject({
      workspaceId: account.workspaceId,
      actorType: 'user',
      actorId: account.userId,
    });
  });

  it('replaces the name and password when an unverified address signs up again', async () => {
    await signUp({ ...SIGN_UP, password: 'the first password' });
    const firstToken = harness.mailer.latestToken(EMAIL);

    const second = await signUp({ ...SIGN_UP, name: 'Countess Ada' });

    expect(second.status).toBe(202);
    // The first sign-up's link died with its password.
    await verify(firstToken).expect(404);
    await verify(harness.mailer.latestToken(EMAIL)).expect(204);
    await signIn(harness.app, EMAIL, 'the first password').then((response) =>
      expect(response.status).toBe(401),
    );
    const response = await signIn(harness.app, EMAIL, PASSWORD);
    expect(response.body).toMatchObject({ user: { name: 'Countess Ada' } });
  });

  it('answers 202 for a verified address, changes nothing, and mails a notice', async () => {
    await createAccount(harness, { email: EMAIL });
    const mailsBefore = harness.mailer.to(EMAIL).length;

    const response = await signUp({
      ...SIGN_UP,
      password: 'an attacker password',
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({});
    const notice = harness.mailer.to(EMAIL).slice(mailsBefore);
    expect(notice.map((mail) => mail.subject)).toEqual([
      'You already have an account',
    ]);
    expect(notice[0]?.text).not.toContain('token=');
    expect((await signIn(harness.app, EMAIL, PASSWORD)).status).toBe(200);
    const attacker = await signIn(harness.app, EMAIL, 'an attacker password');
    expect(attacker.status).toBe(401);
  });

  it('lets a verification link work once', async () => {
    await signUp();
    const token = harness.mailer.latestToken(EMAIL);

    await verify(token).expect(204);
    const again = await verify(token);

    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a verification link after 24 hours', async () => {
    await signUp();
    const token = harness.mailer.latestToken(EMAIL);

    harness.clock.advance(24 * HOUR_MS + 1_000);

    await verify(token).expect(404);
  });

  it('refuses an unknown verification token', async () => {
    await verify('no-such-token').expect(404);
  });

  it('sends a fresh link on request, and only to an unverified account', async () => {
    await signUp();
    const firstToken = harness.mailer.latestToken(EMAIL);

    await resend(EMAIL).expect(202);
    await resend('nobody@shortener.test').expect(202);

    expect(harness.mailer.to(EMAIL)).toHaveLength(2);
    expect(harness.mailer.to('nobody@shortener.test')).toHaveLength(0);
    await verify(firstToken).expect(404);
    await verify(harness.mailer.latestToken(EMAIL)).expect(204);

    await resend(EMAIL).expect(202);
    expect(harness.mailer.to(EMAIL)).toHaveLength(2);
  });

  it('sends at most 3 verification mails to one address per hour', async () => {
    await signUp();
    await resend(EMAIL);
    await resend(EMAIL);

    const fourth = await resend(EMAIL);
    const fifth = await signUp({ ...SIGN_UP, password: 'another password!' });

    expect(fourth.status).toBe(202);
    expect(fifth.status).toBe(202);
    expect(harness.mailer.to(EMAIL)).toHaveLength(3);
    // A throttled sign-up changes nothing: the mailed link still matches.
    await verify(harness.mailer.latestToken(EMAIL)).expect(204);
    expect((await signIn(harness.app, EMAIL, PASSWORD)).status).toBe(200);
  });

  it('stores the password as an Argon2id hash', async () => {
    await signUp();

    const user = await harness.app
      .get(DataSource)
      .getRepository(User)
      .findOneByOrFail({ email: EMAIL });

    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it.each([
    ['a password under 12 characters', { ...SIGN_UP, password: 'short' }],
    [
      'a password over 128 characters',
      { ...SIGN_UP, password: 'a'.repeat(129) },
    ],
    ['a malformed email', { ...SIGN_UP, email: 'not-an-email' }],
    ['a missing name', { email: EMAIL, password: PASSWORD }],
    ['an unknown property', { ...SIGN_UP, isPlatformAdmin: true }],
  ])('answers 400 for %s', async (_case, body) => {
    const response = await signUp(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(harness.mailer.sent).toHaveLength(0);
  });

  it('keeps the session cookie usable for the signed-in account', async () => {
    await signUp();
    await verify(harness.mailer.latestToken(EMAIL));
    const cookie = sessionCookieOf(await signIn(harness.app, EMAIL, PASSWORD));

    const response = await as(harness.app, cookie).get('/api/v1/me');

    expect(response.status).toBe(200);
  });
});
