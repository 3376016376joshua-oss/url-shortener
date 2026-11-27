import { createHash } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiKey } from '../../src/database/entities/api-key.entity.js';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import {
  addMember,
  as,
  createAccount,
  createIdentityHarness,
  type Account,
  type IdentityHarness,
} from '../identity/identity-harness.js';

const MINUTE_MS = 60_000;
const API_KEY_QUOTA = 20;
const NO_SUCH_ID = '0193d2a0-0000-7000-8000-000000000000';

describe('API keys (ID-7, AC-7, AC-50)', () => {
  let harness: IdentityHarness;
  let dataSource: DataSource;
  let owner: Account;
  let base: string;

  const createKey = (body: Record<string, unknown> = { name: 'CI' }) =>
    as(harness.app, owner.cookie).post(`${base}/api-keys`).send(body);
  const newKey = async (): Promise<{ id: string; key: string }> => {
    const response = await createKey().expect(201);
    return response.body as { id: string; key: string };
  };
  const withKey = (key: string, path: string) =>
    request(harness.app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${key}`);

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

  it('returns the key once, and stores only its hash and first 12 characters', async () => {
    const response = await createKey({ name: '  Deploy bot ' });

    expect(response.status).toBe(201);
    const created = response.body as { id: string; key: string };
    expect(created.key).toMatch(/^usk_[0-9A-Za-z]{40}$/);
    expect(response.body).toMatchObject({
      name: 'Deploy bot',
      keyPrefix: created.key.slice(0, 12),
      createdByUserId: owner.userId,
      lastUsedAt: null,
      expiresAt: null,
    });

    const list = await as(harness.app, owner.cookie).get(`${base}/api-keys`);
    expect(list.body).toMatchObject({
      items: [{ id: created.id, keyPrefix: created.key.slice(0, 12) }],
      nextCursor: null,
    });
    expect(JSON.stringify(list.body)).not.toContain(created.key);
    const row = await dataSource
      .getRepository(ApiKey)
      .findOneByOrFail({ id: created.id });
    expect(row.keyHash).toEqual(
      createHash('sha256').update(created.key).digest(),
    );
  });

  it('acts as a member of its own workspace only', async () => {
    const stranger = await createAccount(harness);
    const { id, key } = await newKey();

    const me = await withKey(key, '/api/v1/me');
    const own = await withKey(key, base);
    const foreign = await withKey(
      key,
      `/api/v1/workspaces/${stranger.workspaceId}`,
    );

    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      kind: 'api_key',
      apiKey: { id, name: 'CI', keyPrefix: key.slice(0, 12) },
      workspaces: [
        {
          id: owner.workspaceId,
          name: `${owner.name}'s workspace`,
          slug: expect.any(String) as string,
          role: 'member',
        },
      ],
    });
    expect(own.body).toMatchObject({ id: owner.workspaceId, role: 'member' });
    expect(foreign.status).toBe(404);
  });

  it('may not call the routes reserved for signed-in users', async () => {
    const { key } = await newKey();
    const send = (method: 'get' | 'post' | 'patch', path: string) =>
      request(harness.app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${key}`);

    const responses = await Promise.all([
      send('get', `${base}/members`),
      send('get', `${base}/api-keys`),
      send('post', `${base}/api-keys`).send({ name: 'Another' }),
      send('get', `${base}/audit-log`),
      send('get', '/api/v1/me/sessions'),
      send('patch', '/api/v1/me').send({ name: 'Robot' }),
      send('post', '/api/v1/workspaces').send({ name: 'Mine' }),
      send('post', '/api/v1/auth/sign-out'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('stops working when revoked', async () => {
    const { id, key } = await newKey();
    await withKey(key, '/api/v1/me').expect(200);

    const response = await as(harness.app, owner.cookie).delete(
      `${base}/api-keys/${id}`,
    );

    expect(response.status).toBe(204);
    expect((await withKey(key, '/api/v1/me')).status).toBe(401);
    const list = await as(harness.app, owner.cookie).get(`${base}/api-keys`);
    expect(list.body).toMatchObject({ items: [] });
    const again = await as(harness.app, owner.cookie).delete(
      `${base}/api-keys/${id}`,
    );
    expect(again.status).toBe(404);
  });

  it('stops working when it expires', async () => {
    const expiresAt = new Date(Date.now() + 60 * MINUTE_MS).toISOString();
    const response = await createKey({ name: 'Short-lived', expiresAt });
    const { key } = response.body as { key: string };
    expect(response.body).toMatchObject({ expiresAt });
    await withKey(key, '/api/v1/me').expect(200);

    harness.clock.advance(61 * MINUTE_MS);

    expect((await withKey(key, '/api/v1/me')).status).toBe(401);
  });

  it.each([
    [
      'an expiry in the past',
      { name: 'CI', expiresAt: '2020-01-01T00:00:00Z' },
    ],
    ['an expiry that is not a timestamp', { name: 'CI', expiresAt: 'soon' }],
    ['an empty name', { name: ' ' }],
    ['an unknown property', { name: 'CI', role: 'admin' }],
  ])('answers 400 for %s', async (_case, body) => {
    const response = await createKey(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it.each([
    ['an unknown key', `usk_${'a'.repeat(40)}`],
    ['a malformed key', 'usk_short'],
    ['a session token sent as a bearer token', 'not-an-api-key'],
  ])('answers 401 for %s', async (_case, key) => {
    const response = await withKey(key, '/api/v1/me');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('does not fall back to the cookie when a bearer token is invalid', async () => {
    const response = await withKey('usk_short', '/api/v1/me').set(
      'Cookie',
      owner.cookie,
    );

    expect(response.status).toBe(401);
  });

  it('refuses the twenty-first key, and frees a place when one is revoked', async () => {
    const keys: Array<{ id: string }> = [];
    for (let n = 0; n < API_KEY_QUOTA; n += 1) {
      keys.push(await newKey());
    }

    const overQuota = await createKey({ name: 'One too many' });
    await as(harness.app, owner.cookie)
      .delete(`${base}/api-keys/${keys[0]?.id}`)
      .expect(204);
    const afterRevoking = await createKey({ name: 'Fits now' });

    expect(overQuota.status).toBe(422);
    expect(overQuota.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(afterRevoking.status).toBe(201);
  });

  it('records when a key was last used, at most once a minute', async () => {
    const { id, key } = await newKey();
    const lastUsedAt = async (): Promise<Date | null> =>
      (await dataSource.getRepository(ApiKey).findOneByOrFail({ id }))
        .lastUsedAt;

    await withKey(key, '/api/v1/me');
    const first = await lastUsedAt();
    harness.clock.advance(MINUTE_MS / 2);
    await withKey(key, '/api/v1/me');
    const withinTheMinute = await lastUsedAt();
    harness.clock.advance(MINUTE_MS);
    await withKey(key, '/api/v1/me');
    const afterTheMinute = await lastUsedAt();

    expect(first).not.toBeNull();
    expect(withinTheMinute).toEqual(first);
    expect(afterTheMinute?.getTime()).toBeGreaterThan(first?.getTime() ?? 0);
  });

  it('lets an admin create and revoke keys', async () => {
    const admin = await createAccount(harness);
    await addMember(harness, owner, admin, 'admin');
    const client = as(harness.app, admin.cookie);

    const created = await client.post(`${base}/api-keys`).send({ name: 'Ops' });
    const revoked = await client.delete(
      `${base}/api-keys/${(created.body as { id: string }).id}`,
    );

    expect([created.status, revoked.status]).toEqual([201, 204]);
  });

  it("cannot revoke another workspace's key", async () => {
    const stranger = await createAccount(harness);
    const { id, key } = await newKey();

    const response = await as(harness.app, stranger.cookie).delete(
      `/api/v1/workspaces/${stranger.workspaceId}/api-keys/${id}`,
    );

    expect(response.status).toBe(404);
    expect((await withKey(key, '/api/v1/me')).status).toBe(200);
    expect(
      (
        await as(harness.app, owner.cookie).delete(
          `${base}/api-keys/${NO_SUCH_ID}`,
        )
      ).status,
    ).toBe(404);
  });

  it('audits creation and revocation, naming the actor and never the key', async () => {
    const { id, key } = await newKey();
    await as(harness.app, owner.cookie).delete(`${base}/api-keys/${id}`);

    const entries = await dataSource.getRepository(AuditLogEntry).find({
      where: { targetType: 'api_key' },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    expect(
      entries.map((entry) => [entry.action, entry.actorType, entry.actorId]),
    ).toEqual([
      ['api_key.created', 'user', owner.userId],
      ['api_key.revoked', 'user', owner.userId],
    ]);
    expect(entries[0]?.metadata).toEqual({
      name: 'CI',
      keyPrefix: key.slice(0, 12),
    });
    expect(JSON.stringify(entries)).not.toContain(key);
  });
});
