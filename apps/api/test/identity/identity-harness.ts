import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Identity } from '@url-shortener/contracts/identity';
import request, { type Response, type Test } from 'supertest';
import { Clock } from '../../src/identity/clock.js';
import { Mailer, type MailMessage } from '../../src/identity/mail/mailer.js';
import { createTestApp } from '../support/create-test-app.js';
import { resetState } from '../support/reset-state.js';
import { testEnv } from '../support/test-env.js';

export const APP_ORIGIN = testEnv.APP_URL;
export const PASSWORD = 'correct horse battery';

/** Stands in for the SMTP server and keeps every mail for the test to read. */
export class CapturingMailer extends Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  to(address: string): MailMessage[] {
    return this.sent.filter((message) => message.to === address);
  }

  /** The token in the link of the newest mail to the address. */
  latestToken(address: string): string {
    const text = this.to(address).at(-1)?.text ?? '';
    const token = /[?&]token=([^\s&]+)/.exec(text)?.[1];
    if (token === undefined) {
      throw new Error(`No mail with a token was sent to ${address}`);
    }
    return decodeURIComponent(token);
  }
}

/** A clock a test can move forward, to reach an expiry without waiting. */
export class TestClock extends Clock {
  private offsetMs = 0;

  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  reset(): void {
    this.offsetMs = 0;
  }
}

export interface IdentityHarness {
  app: NestExpressApplication;
  mailer: CapturingMailer;
  clock: TestClock;
  /** Empties Postgres, Redis, the mailbox, and resets the clock. */
  reset(): Promise<void>;
}

type Customize = NonNullable<Parameters<typeof createTestApp>[0]>;

/**
 * The whole application with real sessions and API keys; only the SMTP
 * server and the clock are replaced.
 */
export async function createIdentityHarness(
  customize: Customize = (builder) => builder,
): Promise<IdentityHarness> {
  const mailer = new CapturingMailer();
  const clock = new TestClock();
  const app = await createTestApp((builder) =>
    customize(
      builder
        .overrideProvider(Mailer)
        .useValue(mailer)
        .overrideProvider(Clock)
        .useValue(clock),
    ),
  );
  return {
    app,
    mailer,
    clock,
    reset: async () => {
      await resetState(app);
      mailer.sent.length = 0;
      clock.reset();
    },
  };
}

export interface Account {
  email: string;
  name: string;
  password: string;
  /** The `Cookie` header value of the signed-in session. */
  cookie: string;
  userId: string;
  /** The workspace created at verification, owned by the account. */
  workspaceId: string;
}

/** The `session=...` pair of a response that set the session cookie. */
export function sessionCookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('session='));
  if (cookie === undefined) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] ?? '';
}

export function post(app: NestExpressApplication, path: string): Test {
  return request(app.getHttpServer()).post(path).set('Origin', APP_ORIGIN);
}

/** An HTTP client that carries one account's session cookie. */
export function as(app: NestExpressApplication, cookie: string) {
  const send = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(app.getHttpServer())
      [method](path)
      .set('Cookie', cookie)
      .set('Origin', APP_ORIGIN);
  return {
    get: (path: string) => send('get', path),
    post: (path: string) => send('post', path),
    patch: (path: string) => send('patch', path),
    delete: (path: string) => send('delete', path),
  };
}

export async function signIn(
  app: NestExpressApplication,
  email: string,
  password: string,
): Promise<Response> {
  return post(app, '/api/v1/auth/sign-in').send({ email, password });
}

let sequence = 0;

/** Signs up, follows the mailed link, and signs in: a real, verified account. */
export async function createAccount(
  harness: IdentityHarness,
  overrides: Partial<Pick<Account, 'email' | 'name' | 'password'>> = {},
): Promise<Account> {
  sequence += 1;
  const credentials = {
    email: `person${sequence}@shortener.test`,
    name: `Person ${sequence}`,
    password: PASSWORD,
    ...overrides,
  };
  const { app, mailer } = harness;
  await post(app, '/api/v1/auth/sign-up').send(credentials).expect(202);
  await post(app, '/api/v1/auth/verify-email')
    .send({ token: mailer.latestToken(credentials.email) })
    .expect(204);
  const response = await signIn(app, credentials.email, credentials.password);
  const identity = response.body as Identity;
  if (response.status !== 200 || identity.kind !== 'session') {
    throw new Error(`Sign-in failed with ${response.status}`);
  }
  return {
    ...credentials,
    cookie: sessionCookieOf(response),
    userId: identity.user.id,
    workspaceId: identity.workspaces[0]?.id ?? '',
  };
}

/** Invites the account to the owner's workspace and accepts as that account. */
export async function addMember(
  harness: IdentityHarness,
  owner: Account,
  invitee: Account,
  role: 'admin' | 'member',
): Promise<void> {
  const { app, mailer } = harness;
  await as(app, owner.cookie)
    .post(`/api/v1/workspaces/${owner.workspaceId}/invitations`)
    .send({ email: invitee.email, role })
    .expect(201);
  await as(app, invitee.cookie)
    .post('/api/v1/invitations/accept')
    .send({ token: mailer.latestToken(invitee.email) })
    .expect(200);
}
