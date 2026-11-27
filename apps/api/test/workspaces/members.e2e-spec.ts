import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import { WorkspaceMember } from '../../src/database/entities/workspace-member.entity.js';
import {
  addMember,
  as,
  createAccount,
  createIdentityHarness,
  type Account,
  type IdentityHarness,
} from '../identity/identity-harness.js';

describe('members (ID-5, AC-6)', () => {
  let harness: IdentityHarness;
  let dataSource: DataSource;
  let owner: Account;
  let base: string;

  const removeMember = (actor: Account, target: Account) =>
    as(harness.app, actor.cookie).delete(`${base}/members/${target.userId}`);
  const changeRole = (actor: Account, target: Account, role: string) =>
    as(harness.app, actor.cookie)
      .patch(`${base}/members/${target.userId}`)
      .send({ role });
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

  describe('members', () => {
    it('lists members in the order they joined', async () => {
      const admin = await join('admin');

      const response = await as(harness.app, admin.cookie).get(
        `${base}/members`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        items: [
          {
            userId: owner.userId,
            email: owner.email,
            name: owner.name,
            role: 'owner',
            joinedAt: expect.any(String) as string,
          },
          {
            userId: admin.userId,
            email: admin.email,
            name: admin.name,
            role: 'admin',
            joinedAt: expect.any(String) as string,
          },
        ],
        nextCursor: null,
      });
    });

    it('lets only an owner change roles', async () => {
      const admin = await join('admin');
      const member = await join('member');

      const byAdmin = await changeRole(admin, member, 'admin');
      const byOwner = await changeRole(owner, member, 'admin');

      expect(byAdmin.status).toBe(403);
      expect(byOwner.status).toBe(200);
      expect(byOwner.body).toMatchObject({
        userId: member.userId,
        role: 'admin',
      });
      expect(await roleOf(member)).toBe('admin');
    });

    it('lets an admin remove a member but not an admin or an owner', async () => {
      const admin = await join('admin');
      const otherAdmin = await join('admin');
      const member = await join('member');

      const removesOwner = await removeMember(admin, owner);
      const removesAdmin = await removeMember(admin, otherAdmin);
      const removesMember = await removeMember(admin, member);

      expect(removesOwner.status).toBe(403);
      expect(removesAdmin.status).toBe(403);
      expect(removesMember.status).toBe(204);
      expect(await roleOf(owner)).toBe('owner');
      expect(await roleOf(otherAdmin)).toBe('admin');
      expect(await roleOf(member)).toBeUndefined();
    });

    it('lets an owner remove anyone, and a removed member loses access at once', async () => {
      const admin = await join('admin');

      const response = await removeMember(owner, admin);

      expect(response.status).toBe(204);
      expect((await as(harness.app, admin.cookie).get(base)).status).toBe(404);
    });

    it('lets a member leave but not remove anyone else', async () => {
      const member = await join('member');
      const other = await join('member');

      const removesOther = await removeMember(member, other);
      const leaves = await removeMember(member, member);

      expect(removesOther.status).toBe(403);
      expect(leaves.status).toBe(204);
      expect(await roleOf(other)).toBe('member');
    });

    it('never lets the last owner leave, be removed, or be demoted', async () => {
      await join('admin');

      const leaves = await removeMember(owner, owner);
      const demotes = await changeRole(owner, owner, 'admin');

      expect(leaves.status).toBe(409);
      expect(leaves.body).toMatchObject({ code: 'CONFLICT' });
      expect(demotes.status).toBe(409);
      expect(await roleOf(owner)).toBe('owner');
    });

    it('lets an owner step down once there is another owner', async () => {
      const successor = await join('admin');
      await changeRole(owner, successor, 'owner').expect(200);

      const demotes = await changeRole(owner, owner, 'member');
      const removed = await removeMember(successor, owner);

      expect(demotes.status).toBe(200);
      expect(removed.status).toBe(204);
      expect(await roleOf(successor)).toBe('owner');
    });

    it('answers 404 for someone who is not a member', async () => {
      const stranger = await createAccount(harness);

      expect((await removeMember(owner, stranger)).status).toBe(404);
      expect((await changeRole(owner, stranger, 'admin')).status).toBe(404);
    });

    it('audits role changes and removals', async () => {
      const member = await join('member');
      await changeRole(owner, member, 'admin');
      await removeMember(owner, member);
      const leaver = await join('member');
      await removeMember(leaver, leaver);

      const entries = await dataSource.getRepository(AuditLogEntry).find({
        where: { workspaceId: owner.workspaceId, targetType: 'member' },
        order: { createdAt: 'ASC', id: 'ASC' },
      });

      expect(
        entries.map((entry) => [
          entry.action,
          entry.actorId,
          entry.targetId,
          entry.metadata,
        ]),
      ).toEqual([
        [
          'member.role_changed',
          owner.userId,
          member.userId,
          { from: 'member', to: 'admin' },
        ],
        ['member.removed', owner.userId, member.userId, { role: 'admin' }],
        ['member.left', leaver.userId, leaver.userId, { role: 'member' }],
      ]);
    });
  });
});
