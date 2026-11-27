import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import { User } from '../../src/database/entities/user.entity.js';
import { WorkspaceInvitation } from '../../src/database/entities/workspace-invitation.entity.js';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../src/database/entities/workspace-member.entity.js';
import {
  APP_ORIGIN,
  addMember,
  as,
  createAccount,
  createIdentityHarness,
  type Account,
  type IdentityHarness,
} from '../identity/identity-harness.js';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MEMBER_QUOTA = 25;
const NO_SUCH_ID = '0193d2a0-0000-7000-8000-000000000000';

describe('invitations (ID-6, AC-6, AC-50)', () => {
  let harness: IdentityHarness;
  let dataSource: DataSource;
  let owner: Account;
  let base: string;

  const invite = (inviter: Account, email: string, role = 'member') =>
    as(harness.app, inviter.cookie)
      .post(`${base}/invitations`)
      .send({ email, role });
  const accept = (account: Account, token: string) =>
    as(harness.app, account.cookie)
      .post('/api/v1/invitations/accept')
      .send({ token });
  const removeMember = (actor: Account, target: Account) =>
    as(harness.app, actor.cookie).delete(`${base}/members/${target.userId}`);
  const roleOf = async (account: Account): Promise<string | undefined> => {
    const membership = await dataSource
      .getRepository(WorkspaceMember)
      .findOneBy({ workspaceId: owner.workspaceId, userId: account.userId });
    return membership?.role;
  };
  const join = async (role: 'admin' | 'member'): Promise<Account> => {
    const account = await createAccount(harness);
    await addMember(harness, owner, account, role);
    return account;
  };
  /** Fills the workspace with members directly, up to `total`. */
  const fillTo = async (total: number): Promise<void> => {
    const members = dataSource.getRepository(WorkspaceMember);
    const current = await members.countBy({ workspaceId: owner.workspaceId });
    for (let n = current; n < total; n += 1) {
      const user = await dataSource.getRepository(User).save({
        email: `filler${n}@shortener.test`,
        name: `Filler ${n}`,
        passwordHash: 'not-a-real-hash',
        emailVerifiedAt: new Date(),
      });
      await members.insert({
        workspaceId: owner.workspaceId,
        userId: user.id,
        role: WorkspaceRole.Member,
      });
    }
  };

  beforeAll(async () => {
    harness = await createIdentityHarness();
    dataSource = harness.app.get(DataSource);
  });

  beforeEach(async () => {
    await harness.reset();
    owner = await createAccount(harness);
    base = `/api/v1/workspaces/${owner.workspaceId}`;
  });

  afterAll(async () => {
    await harness.app.close();
  });

  describe('invitations', () => {
    it('mails a link, lists the invitation, and stores only the token hash', async () => {
      const response = await invite(
        owner,
        'New.Person@Shortener.test',
        'admin',
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        email: 'new.person@shortener.test',
        role: 'admin',
        invitedByUserId: owner.userId,
      });
      expect(response.body).not.toHaveProperty('token');
      const [mail] = harness.mailer.to('new.person@shortener.test');
      expect(mail?.subject).toBe(`Join ${owner.name}'s workspace`);
      expect(mail?.text).toContain(`${APP_ORIGIN}/invitations/accept?token=`);
      const list = await as(harness.app, owner.cookie).get(
        `${base}/invitations`,
      );
      expect(list.body).toMatchObject({
        items: [{ email: 'new.person@shortener.test', role: 'admin' }],
        nextCursor: null,
      });
      const token = harness.mailer.latestToken('new.person@shortener.test');
      const [row] = await dataSource.getRepository(WorkspaceInvitation).find();
      expect(row?.tokenHash.toString('base64url')).not.toBe(token);
    });

    it('is accepted only by the account with the invited email', async () => {
      const invited = await createAccount(harness);
      const someoneElse = await createAccount(harness);
      await invite(owner, invited.email, 'admin').expect(201);
      const token = harness.mailer.latestToken(invited.email);

      const wrongAccount = await accept(someoneElse, token);
      const rightAccount = await accept(invited, token);

      expect(wrongAccount.status).toBe(403);
      expect(await roleOf(someoneElse)).toBeUndefined();
      expect(rightAccount.status).toBe(200);
      expect(rightAccount.body).toMatchObject({
        id: owner.workspaceId,
        role: 'admin',
      });
      expect(await roleOf(invited)).toBe('admin');
    });

    it('is deleted on acceptance, so its link works once', async () => {
      const invited = await createAccount(harness);
      await invite(owner, invited.email);
      const token = harness.mailer.latestToken(invited.email);

      await accept(invited, token).expect(200);
      const again = await accept(invited, token);

      expect(again.status).toBe(404);
      expect(await dataSource.getRepository(WorkspaceInvitation).count()).toBe(
        0,
      );
    });

    it('can be sent again after the member leaves', async () => {
      const member = await join('member');
      await removeMember(member, member).expect(204);

      await invite(owner, member.email, 'admin').expect(201);
      await accept(member, harness.mailer.latestToken(member.email)).expect(
        200,
      );

      expect(await roleOf(member)).toBe('admin');
    });

    it('expires after 7 days', async () => {
      const invited = await createAccount(harness);
      await invite(owner, invited.email);
      const token = harness.mailer.latestToken(invited.email);

      harness.clock.advance(7 * DAY_MS + 1_000);
      const response = await accept(invited, token);

      expect(response.status).toBe(404);
      const list = await as(harness.app, owner.cookie).get(
        `${base}/invitations`,
      );
      expect(list.body).toMatchObject({ items: [] });
    });

    it('is renewed by inviting the same address again: one invitation, newest link only', async () => {
      const invited = await createAccount(harness);
      await invite(owner, invited.email, 'member');
      const firstToken = harness.mailer.latestToken(invited.email);

      await invite(owner, invited.email, 'admin').expect(201);

      expect(await dataSource.getRepository(WorkspaceInvitation).count()).toBe(
        1,
      );
      await accept(invited, firstToken).expect(404);
      await accept(invited, harness.mailer.latestToken(invited.email)).expect(
        200,
      );
      expect(await roleOf(invited)).toBe('admin');
    });

    it('can be revoked, which kills its link', async () => {
      const invited = await createAccount(harness);
      const created = await invite(owner, invited.email);
      const { id } = created.body as { id: string };

      const response = await as(harness.app, owner.cookie).delete(
        `${base}/invitations/${id}`,
      );

      expect(response.status).toBe(204);
      await accept(invited, harness.mailer.latestToken(invited.email)).expect(
        404,
      );
      const unknown = await as(harness.app, owner.cookie).delete(
        `${base}/invitations/${NO_SUCH_ID}`,
      );
      expect(unknown.status).toBe(404);
    });

    it('refuses to invite someone who is already a member', async () => {
      const member = await join('member');

      const response = await invite(owner, member.email);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'CONFLICT' });
    });

    it.each([
      ['the owner role', { email: 'x@shortener.test', role: 'owner' }],
      ['a malformed email', { email: 'nope', role: 'member' }],
      ['a missing role', { email: 'x@shortener.test' }],
    ])('answers 400 for %s', async (_case, body) => {
      const response = await as(harness.app, owner.cookie)
        .post(`${base}/invitations`)
        .send(body);

      expect(response.status).toBe(400);
    });

    it('sends at most 3 invitations to one address per hour', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await invite(owner, 'popular@shortener.test').expect(201);
      }

      const fourth = await invite(owner, 'popular@shortener.test');

      expect(fourth.status).toBe(429);
      expect(fourth.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(harness.mailer.to('popular@shortener.test')).toHaveLength(3);
    });

    it('needs a signed-in user to accept', async () => {
      const response = await as(harness.app, 'session=not-a-session')
        .post('/api/v1/invitations/accept')
        .send({ token: 'anything' });

      expect(response.status).toBe(401);
    });

    it('audits creation and acceptance, naming who acted', async () => {
      const invited = await createAccount(harness);
      await addMember(harness, owner, invited, 'member');

      const entries = await dataSource.getRepository(AuditLogEntry).find({
        where: { workspaceId: owner.workspaceId },
        order: { createdAt: 'ASC', id: 'ASC' },
      });

      expect(
        entries
          .filter((entry) => entry.action.startsWith('invitation.'))
          .map((entry) => [entry.action, entry.actorId, entry.metadata]),
      ).toEqual([
        [
          'invitation.created',
          owner.userId,
          { email: invited.email, role: 'member' },
        ],
        ['invitation.accepted', invited.userId, { role: 'member' }],
      ]);
    });
  });

  describe('the member quota', () => {
    it('refuses an invitation the quota could not honour', async () => {
      await fillTo(MEMBER_QUOTA - 1);
      await invite(owner, 'last-seat@shortener.test').expect(201);

      const response = await invite(owner, 'one-too-many@shortener.test');

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    });

    it('refuses to accept into a full workspace', async () => {
      const invited = await createAccount(harness);
      await invite(owner, invited.email).expect(201);
      await fillTo(MEMBER_QUOTA);

      const response = await accept(
        invited,
        harness.mailer.latestToken(invited.email),
      );

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
      expect(await roleOf(invited)).toBeUndefined();
    });
  });
});
