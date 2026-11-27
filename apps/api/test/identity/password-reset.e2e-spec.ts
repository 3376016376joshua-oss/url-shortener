import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
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

const HOUR_MS = 3_600_000;
const NEW_PASSWORD = 'a brand new password';
const ADDRESS_FAILURE_LIMIT = 5;

describe('password reset (ID-3, ID-4, AC-3)', () => {
  let harness: IdentityHarness;
  let account: Account;

  const requestReset = (email: string) =>
    post(harness.app, '/api/v1/auth/password-reset').send({ email });
  const confirmReset = (token: string, password = NEW_PASSWORD) =>
    post(harness.app, '/api/v1/auth/password-reset/confirm').send({
      token,
      password,
    });

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    account = await createAccount(harness);
    harness.mailer.sent.length = 0;
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('answers the same 202 whether or not the email has an account', async () => {
    const known = await requestReset(account.email);
    const unknown = await requestReset('nobody@shortener.test');

    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(known.body).toEqual(unknown.body);
    expect(harness.mailer.sent.map((mail) => mail.to)).toEqual([account.email]);
    expect(harness.mailer.sent[0]?.text).toContain(
      `${APP_ORIGIN}/reset-password?token=`,
    );
  });

  it('mails nothing to an account that never verified its address', async () => {
    const email = 'unverified@shortener.test';
    await post(harness.app, '/api/v1/auth/sign-up').send({
      email,
      name: 'Unverified',
      password: PASSWORD,
    });
    harness.mailer.sent.length = 0;

    await requestReset(email).expect(202);

    expect(harness.mailer.sent).toHaveLength(0);
  });

  it('sets the new password and revokes every session of the account', async () => {
    const second = sessionCookieOf(
      await signIn(harness.app, account.email, PASSWORD),
    );
    await requestReset(account.email);

    const response = await confirmReset(
      harness.mailer.latestToken(account.email),
    );

    expect(response.status).toBe(204);
    for (const cookie of [account.cookie, second]) {
      expect((await as(harness.app, cookie).get('/api/v1/me')).status).toBe(
        401,
      );
    }
    expect((await signIn(harness.app, account.email, PASSWORD)).status).toBe(
      401,
    );
    expect(
      (await signIn(harness.app, account.email, NEW_PASSWORD)).status,
    ).toBe(200);
  });

  it('lets a reset link work once', async () => {
    await requestReset(account.email);
    const token = harness.mailer.latestToken(account.email);

    await confirmReset(token).expect(204);
    const again = await confirmReset(token, 'yet another password');

    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(
      (await signIn(harness.app, account.email, NEW_PASSWORD)).status,
    ).toBe(200);
  });

  it('refuses a reset link after an hour', async () => {
    await requestReset(account.email);
    const token = harness.mailer.latestToken(account.email);

    harness.clock.advance(HOUR_MS + 1_000);
    const response = await confirmReset(token);

    expect(response.status).toBe(404);
    expect((await signIn(harness.app, account.email, PASSWORD)).status).toBe(
      200,
    );
  });

  it('accepts only the newest reset link', async () => {
    await requestReset(account.email);
    const first = harness.mailer.latestToken(account.email);
    await requestReset(account.email);

    await confirmReset(first).expect(404);
    await confirmReset(harness.mailer.latestToken(account.email)).expect(204);
  });

  it('does not accept a verification token as a reset token', async () => {
    const email = 'pending@shortener.test';
    await post(harness.app, '/api/v1/auth/sign-up').send({
      email,
      name: 'Pending',
      password: PASSWORD,
    });

    await confirmReset(harness.mailer.latestToken(email)).expect(404);
  });

  it('lifts a sign-in lockout', async () => {
    for (let attempt = 0; attempt < ADDRESS_FAILURE_LIMIT; attempt += 1) {
      await signIn(harness.app, account.email, 'a wrong password');
    }
    expect((await signIn(harness.app, account.email, PASSWORD)).status).toBe(
      401,
    );
    await requestReset(account.email);

    await confirmReset(harness.mailer.latestToken(account.email)).expect(204);

    expect(
      (await signIn(harness.app, account.email, NEW_PASSWORD)).status,
    ).toBe(200);
  });

  it('sends at most 3 reset mails to one address per hour', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await requestReset(account.email).expect(202);
    }

    expect(harness.mailer.to(account.email)).toHaveLength(3);
  });

  it('audits the reset in the account’s workspace', async () => {
    await requestReset(account.email);
    await confirmReset(harness.mailer.latestToken(account.email));

    const entry = await harness.app
      .get(DataSource)
      .getRepository(AuditLogEntry)
      .findOneByOrFail({ action: 'user.password_reset' });

    expect(entry).toMatchObject({
      workspaceId: account.workspaceId,
      actorType: 'user',
      actorId: account.userId,
      targetId: account.userId,
    });
  });

  it('answers 400 for a new password under 12 characters', async () => {
    await requestReset(account.email);

    const response = await confirmReset(
      harness.mailer.latestToken(account.email),
      'short',
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
