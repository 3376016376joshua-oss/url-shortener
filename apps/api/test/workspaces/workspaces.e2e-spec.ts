import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import { Workspace } from '../../src/database/entities/workspace.entity.js';
import {
  addMember,
  as,
  createAccount,
  createIdentityHarness,
  type Account,
  type IdentityHarness,
} from '../identity/identity-harness.js';

const NO_SUCH_ID = '0193d2a0-0000-7000-8000-000000000000';

describe('workspaces (ID-5, ID-8, AC-5)', () => {
  let harness: IdentityHarness;
  let dataSource: DataSource;
  let owner: Account;
  const workspacePath = (account: Account) =>
    `/api/v1/workspaces/${account.workspaceId}`;

  beforeAll(async () => {
    harness = await createIdentityHarness();
    dataSource = harness.app.get(DataSource);
  });

  beforeEach(async () => {
    await harness.reset();
    owner = await createAccount(harness);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  describe('create, read, rename', () => {
    it('lets a user create more workspaces, owned by them', async () => {
      const response = await as(harness.app, owner.cookie)
        .post('/api/v1/workspaces')
        .send({ name: '  Marketing  ' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Marketing',
        slug: expect.stringMatching(/^marketing-[a-z0-9]{8}$/) as string,
        role: 'owner',
      });
      const me = await as(harness.app, owner.cookie).get('/api/v1/me');
      expect(
        (me.body as { workspaces: Array<{ name: string }> }).workspaces.map(
          (workspace) => workspace.name,
        ),
      ).toEqual([`${owner.name}'s workspace`, 'Marketing']);
    });

    it('lets two workspaces share a name', async () => {
      const client = as(harness.app, owner.cookie);

      const first = await client
        .post('/api/v1/workspaces')
        .send({ name: 'Team' });
      const second = await client
        .post('/api/v1/workspaces')
        .send({ name: 'Team' });

      expect([first.status, second.status]).toEqual([201, 201]);
      expect((first.body as Workspace).slug).not.toBe(
        (second.body as Workspace).slug,
      );
    });

    it("shows a member the workspace with the member's own role", async () => {
      const member = await createAccount(harness);
      await addMember(harness, owner, member, 'member');

      const response = await as(harness.app, member.cookie).get(
        workspacePath(owner),
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: owner.workspaceId,
        role: 'member',
      });
    });

    it('lets the owner rename it, keeping the slug, and audits the change', async () => {
      const before = await as(harness.app, owner.cookie).get(
        workspacePath(owner),
      );

      const response = await as(harness.app, owner.cookie)
        .patch(workspacePath(owner))
        .send({ name: 'Renamed' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Renamed',
        slug: (before.body as Workspace).slug,
      });
      const entry = await dataSource
        .getRepository(AuditLogEntry)
        .findOneBy({ action: 'workspace.renamed' });
      expect(entry).toMatchObject({
        workspaceId: owner.workspaceId,
        actorId: owner.userId,
        metadata: { name: 'Renamed' },
      });
    });

    it.each([
      ['an empty name', { name: '   ' }],
      ['a name over 100 characters', { name: 'a'.repeat(101) }],
      ['an unknown property', { name: 'Team', slug: 'mine' }],
    ])('answers 400 for %s', async (_case, body) => {
      const response = await as(harness.app, owner.cookie)
        .post('/api/v1/workspaces')
        .send(body);

      expect(response.status).toBe(400);
    });
  });

  describe('authorisation', () => {
    it('answers 404 to a user outside the workspace on every one of its routes', async () => {
      const outsider = await createAccount(harness);
      const base = workspacePath(owner);
      type Route = [
        method: 'get' | 'post' | 'patch' | 'delete',
        path: string,
        body?: Record<string, unknown>,
      ];
      const invitation = { email: 'friend@shortener.test', role: 'member' };
      const routes: Route[] = [
        ['get', base],
        ['patch', base, { name: 'Taken over' }],
        ['delete', base],
        ['get', `${base}/members`],
        ['patch', `${base}/members/${owner.userId}`, { role: 'member' }],
        ['delete', `${base}/members/${owner.userId}`],
        ['get', `${base}/invitations`],
        ['post', `${base}/invitations`, invitation],
        ['delete', `${base}/invitations/${NO_SUCH_ID}`],
        ['get', `${base}/api-keys`],
        ['post', `${base}/api-keys`, { name: 'CI' }],
        ['delete', `${base}/api-keys/${NO_SUCH_ID}`],
        ['get', `${base}/audit-log`],
      ];

      for (const [method, path, body] of routes) {
        const response = await as(harness.app, outsider.cookie)
          [method](path)
          .send(body);

        expect([method, path, response.status]).toEqual([method, path, 404]);
        expect(response.body).toMatchObject({
          code: 'NOT_FOUND',
          message: 'Workspace not found',
        });
      }
    });

    it('answers the same 404 for a workspace that does not exist', async () => {
      const response = await as(harness.app, owner.cookie).get(
        `/api/v1/workspaces/${NO_SUCH_ID}`,
      );

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: 'Workspace not found' });
    });

    it('answers 403 to a member on admin and owner routes', async () => {
      const member = await createAccount(harness);
      await addMember(harness, owner, member, 'member');
      const base = workspacePath(owner);
      const client = as(harness.app, member.cookie);

      const responses = await Promise.all([
        client.post(`${base}/api-keys`).send({ name: 'CI' }),
        client.get(`${base}/api-keys`),
        client.post(`${base}/invitations`).send({
          email: 'friend@shortener.test',
          role: 'member',
        }),
        client.get(`${base}/invitations`),
        client.get(`${base}/audit-log`),
        client.patch(base).send({ name: 'Mine now' }),
        client.delete(base),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
      }
    });

    it('lets an admin manage keys and invitations but not rename or delete', async () => {
      const admin = await createAccount(harness);
      await addMember(harness, owner, admin, 'admin');
      const base = workspacePath(owner);
      const client = as(harness.app, admin.cookie);

      expect((await client.get(`${base}/api-keys`)).status).toBe(200);
      expect((await client.get(`${base}/audit-log`)).status).toBe(200);
      expect((await client.patch(base).send({ name: 'x' })).status).toBe(403);
      expect((await client.delete(base)).status).toBe(403);
    });

    it('answers 400 for a workspace id that is not a UUID', async () => {
      const response = await as(harness.app, owner.cookie).get(
        '/api/v1/workspaces/not-a-uuid',
      );

      expect(response.status).toBe(400);
    });
  });
});
