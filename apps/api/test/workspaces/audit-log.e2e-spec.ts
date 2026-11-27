import type { AuditLogPage } from '@url-shortener/contracts/workspaces';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.js';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import {
  addMember,
  as,
  createAccount,
  createIdentityHarness,
  type Account,
  type IdentityHarness,
} from '../identity/identity-harness.js';

const LINK_ID = '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e';
const DOMAIN_ID = '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a';

describe('audit log (ID-9, AC-8)', () => {
  let harness: IdentityHarness;
  let auditLog: AuditLog;
  let owner: Account;
  let base: string;

  const readLog = async (query = ''): Promise<AuditLogPage> => {
    const response = await as(harness.app, owner.cookie)
      .get(`${base}/audit-log${query}`)
      .expect(200);
    return response.body as AuditLogPage;
  };

  beforeAll(async () => {
    harness = await createIdentityHarness();
    auditLog = harness.app.get(AuditLog);
  });

  beforeEach(async () => {
    await harness.reset();
    owner = await createAccount(harness);
    base = `/api/v1/workspaces/${owner.workspaceId}`;
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('adds an entry naming the actor when a link is created, a domain verified, and a key revoked', async () => {
    const created = await as(harness.app, owner.cookie)
      .post(`${base}/api-keys`)
      .send({ name: 'Deploy bot' });
    const apiKey = created.body as { id: string };
    // What the links and domains workstreams record through the contract.
    await auditLog.record({
      workspaceId: owner.workspaceId,
      actor: { type: 'api_key', id: apiKey.id },
      action: 'link.created',
      target: { type: 'link', id: LINK_ID },
      metadata: { code: 'launch', destinationHost: 'example.com' },
    });
    await auditLog.record({
      workspaceId: owner.workspaceId,
      actor: { type: 'system', id: null },
      action: 'domain.verified',
      target: { type: 'domain', id: DOMAIN_ID },
    });
    await as(harness.app, owner.cookie)
      .delete(`${base}/api-keys/${apiKey.id}`)
      .expect(204);

    const page = await readLog('?limit=3');

    expect(page.items).toEqual([
      {
        id: expect.any(String) as string,
        actor: { type: 'user', id: owner.userId, name: owner.name },
        action: 'api_key.revoked',
        target: { type: 'api_key', id: apiKey.id },
        metadata: {
          name: 'Deploy bot',
          keyPrefix: expect.any(String) as string,
        },
        createdAt: expect.any(String) as string,
      },
      {
        id: expect.any(String) as string,
        actor: { type: 'system', id: null, name: null },
        action: 'domain.verified',
        target: { type: 'domain', id: DOMAIN_ID },
        metadata: {},
        createdAt: expect.any(String) as string,
      },
      {
        id: expect.any(String) as string,
        actor: { type: 'api_key', id: apiKey.id, name: 'Deploy bot' },
        action: 'link.created',
        target: { type: 'link', id: LINK_ID },
        metadata: { code: 'launch', destinationHost: 'example.com' },
        createdAt: expect.any(String) as string,
      },
    ]);
  });

  it('pages through every entry, newest first, without repeating or skipping one', async () => {
    for (let n = 0; n < 60; n += 1) {
      await auditLog.record({
        workspaceId: owner.workspaceId,
        actor: { type: 'user', id: owner.userId },
        action: 'link.created',
        target: { type: 'link', id: LINK_ID },
        metadata: { n },
      });
    }
    const stored = await harness.app
      .get(DataSource)
      .getRepository(AuditLogEntry)
      .countBy({ workspaceId: owner.workspaceId });

    const seen: string[] = [];
    const times: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: AuditLogPage = await readLog(
        `?limit=25${cursor === null ? '' : `&cursor=${cursor}`}`,
      );
      seen.push(...page.items.map((entry) => entry.id));
      times.push(...page.items.map((entry) => entry.createdAt));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(stored);
    expect(new Set(seen).size).toBe(stored);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('defaults to 25 entries a page', async () => {
    for (let n = 0; n < 30; n += 1) {
      await auditLog.record({
        workspaceId: owner.workspaceId,
        actor: { type: 'system', id: null },
        action: 'domain.verified',
        target: { type: 'domain', id: DOMAIN_ID },
      });
    }

    const page = await readLog();

    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).not.toBeNull();
  });

  it("shows only the workspace's own entries", async () => {
    const other = await createAccount(harness);
    await as(harness.app, other.cookie)
      .post(`/api/v1/workspaces/${other.workspaceId}/api-keys`)
      .send({ name: 'Theirs' })
      .expect(201);

    const page = await readLog();

    expect(page.items.map((entry) => entry.action)).toEqual([
      'user.signed_in',
      'workspace.created',
    ]);
  });

  it.each([
    ['a limit over 100', '?limit=101'],
    ['a limit of zero', '?limit=0'],
    ['a cursor it did not issue', '?cursor=bm90LWEtY3Vyc29y'],
    ['an unknown parameter', '?action=link.created'],
  ])('answers 400 for %s', async (_case, query) => {
    const response = await as(harness.app, owner.cookie).get(
      `${base}/audit-log${query}`,
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('is readable by admins and owners only', async () => {
    const admin = await createAccount(harness);
    const member = await createAccount(harness);
    await addMember(harness, owner, admin, 'admin');
    await addMember(harness, owner, member, 'member');

    const asAdmin = await as(harness.app, admin.cookie).get(
      `${base}/audit-log`,
    );
    const asMember = await as(harness.app, member.cookie).get(
      `${base}/audit-log`,
    );

    expect(asAdmin.status).toBe(200);
    expect(asMember.status).toBe(403);
  });

  it('offers no way to change or delete an entry', async () => {
    const [entry] = (await readLog()).items;
    const client = as(harness.app, owner.cookie);

    const responses = await Promise.all([
      client.delete(`${base}/audit-log`),
      client.delete(`${base}/audit-log/${entry?.id}`),
      client.patch(`${base}/audit-log/${entry?.id}`).send({ action: 'x' }),
      client.post(`${base}/audit-log`).send({ action: 'x' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404,
    ]);
  });

  it('fails the caller when an entry cannot be recorded', async () => {
    const attempt = auditLog.record({
      workspaceId: owner.workspaceId,
      actor: { type: 'user', id: owner.userId },
      action: 'x'.repeat(65),
      target: { type: 'link', id: LINK_ID },
    });

    await expect(attempt).rejects.toThrow();
  });
});
