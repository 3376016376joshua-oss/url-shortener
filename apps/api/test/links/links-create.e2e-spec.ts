import { linkSchema } from '@url-shortener/contracts/links';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainStatus } from '../../src/database/entities/domain.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  BLOCKED_HOST,
  apiKeyPrincipal,
  createLinksHarness,
  insertDomain,
  linksPath,
  type LinksHarness,
} from './links-harness.js';

const DESTINATION = 'https://example.com/landing';
const MAX_URL_LENGTH = 2048;

describe('creating links', () => {
  let harness: LinksHarness;
  let fixture: WorkspaceFixture;

  const create = (body: Record<string, unknown>, target = fixture) =>
    harness.http().post(linksPath(target)).send(body);

  beforeAll(async () => {
    harness = await createLinksHarness();
  });

  beforeEach(async () => {
    await resetState(harness.app);
    harness.forget();
    fixture = await createWorkspaceFixture(harness.app);
    harness.signIn(fixture.principal);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('creates a link with a generated 7 character Base62 code', async () => {
    const response = await create({ destinationUrl: 'HTTPS://Example.com' });

    expect(response.status).toBe(201);
    const link = linkSchema.parse(response.body);
    expect(link.code).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(link).toMatchObject({
      domain: { id: fixture.domain.id, hostname: 'sho.test' },
      shortUrl: `http://sho.test/${link.code}`,
      destinationUrl: 'https://example.com/',
      title: null,
      status: 'ACTIVE',
      expiresAt: null,
      qrStyle: null,
      clickCount: 0,
      variantCount: 0,
    });
    const row = await harness.dataSource
      .getRepository(Link)
      .findOneByOrFail({ id: link.id });
    expect(row).toMatchObject({
      workspaceId: fixture.workspace.id,
      destinationUrl: 'https://example.com/',
      createdByUserId: fixture.user.id,
    });
  });

  it('accepts a custom code, a title, and an expiry', async () => {
    const response = await create({
      destinationUrl: DESTINATION,
      code: 'Spring_launch-26',
      title: '  Spring launch ',
      expiresAt: '2099-01-01T00:00:00+01:00',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      code: 'Spring_launch-26',
      shortUrl: 'http://sho.test/Spring_launch-26',
      title: 'Spring launch',
      expiresAt: '2098-12-31T23:00:00.000Z',
    });
  });

  it('invalidates the redirect cache and audits the creation', async () => {
    const response = await create({
      destinationUrl: 'https://example.com/landing?token=secret',
    });

    const { id, code } = linkSchema.parse(response.body);
    expect(harness.invalidations).toEqual([{ hostname: 'sho.test', code }]);
    expect(harness.auditEntries).toEqual([
      {
        workspaceId: fixture.workspace.id,
        actor: { type: 'user', id: fixture.user.id },
        action: 'link.created',
        target: { type: 'link', id },
        metadata: {
          code,
          domainId: fixture.domain.id,
          destinationHost: 'example.com',
          kind: 'generated',
        },
      },
    ]);
    expect(JSON.stringify(harness.auditEntries)).not.toContain('secret');
  });

  it.each([
    ['a missing destination', {}],
    ['a destination that is not http(s)', { destinationUrl: 'ftp://a.test/f' }],
    ['a relative destination', { destinationUrl: '/landing' }],
    [
      'a destination over 2,048 characters',
      { destinationUrl: `https://example.com/${'a'.repeat(MAX_URL_LENGTH)}` },
    ],
    ['an unknown property', { destinationUrl: DESTINATION, clickCount: 9 }],
    ['a code that is too short', { destinationUrl: DESTINATION, code: 'ab' }],
    ['a malformed code', { destinationUrl: DESTINATION, code: 'a/b.c' }],
    ['a malformed domain id', { destinationUrl: DESTINATION, domainId: 'x' }],
    ['a malformed expiry', { destinationUrl: DESTINATION, expiresAt: 'soon' }],
    ['an empty title', { destinationUrl: DESTINATION, title: ' ' }],
  ])('answers %s with 400', async (_description, body) => {
    const response = await create(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it.each(['api', 'Admin', 'LOGIN', 'metrics'])(
    'refuses the reserved code %s with 422',
    async (code) => {
      const response = await create({ destinationUrl: DESTINATION, code });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'CODE_RESERVED' });
    },
  );

  it('answers a taken code with 409, even for another workspace', async () => {
    const other = await createWorkspaceFixture(harness.app);
    await create({ destinationUrl: DESTINATION, code: 'launch' });

    harness.signIn(other.principal);
    const response = await create(
      { destinationUrl: DESTINATION, code: 'launch' },
      other,
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'CODE_TAKEN',
      message: 'The code "launch" is already in use on this domain',
    });
  });

  it('treats codes as case-sensitive', async () => {
    await create({ destinationUrl: DESTINATION, code: 'launch' });

    const response = await create({
      destinationUrl: DESTINATION,
      code: 'Launch',
    });

    expect(response.status).toBe(201);
  });

  it('lets two workspaces create links on the platform domain', async () => {
    const other = await createWorkspaceFixture(harness.app);
    const first = await create({ destinationUrl: DESTINATION });

    harness.signIn(other.principal);
    const second = await create({ destinationUrl: DESTINATION }, other);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ domain: { hostname: 'sho.test' } });
  });

  it('lets the same code exist on two domains', async () => {
    const custom = await insertDomain(harness, fixture, 'go.brand.test');
    await create({ destinationUrl: DESTINATION, code: 'launch' });

    const response = await create({
      destinationUrl: 'https://example.com/other',
      code: 'launch',
      domainId: custom.id,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      domain: { id: custom.id, hostname: 'go.brand.test' },
      shortUrl: 'http://go.brand.test/launch',
    });
    expect(harness.invalidations).toContainEqual({
      hostname: 'go.brand.test',
      code: 'launch',
    });
  });

  it.each([DomainStatus.Pending, DomainStatus.Inactive, DomainStatus.Blocked])(
    'refuses a link on a %s domain with 422',
    async (status) => {
      const domain = await insertDomain(
        harness,
        fixture,
        'go.brand.test',
        status,
      );

      const response = await create({
        destinationUrl: DESTINATION,
        domainId: domain.id,
      });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'DOMAIN_NOT_VERIFIED' });
    },
  );

  it("answers another workspace's domain and an unknown one with 404", async () => {
    const other = await createWorkspaceFixture(harness.app);
    const foreign = await insertDomain(harness, other, 'go.other.test');

    for (const domainId of [foreign.id, fixture.workspace.id]) {
      const response = await create({ destinationUrl: DESTINATION, domainId });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Domain not found',
      });
    }
  });

  describe('destination risk check', () => {
    it.each([
      ['a blocklisted host', `https://${BLOCKED_HOST}/offer`],
      ['a subdomain of a blocklisted host', `https://www.${BLOCKED_HOST}/`],
      ['the app host', 'http://app.shortener.test/links'],
      ['the platform short domain', 'https://sho.test/abc1234'],
      ['a loopback address', 'http://127.0.0.1/'],
      ['a loopback address spelled as a number', 'http://2130706433/'],
      ['localhost', 'http://localhost:3000/'],
      ['a private address', 'http://192.168.1.10/router'],
      ['an IPv6 loopback address', 'http://[::1]/'],
    ])('refuses %s with 422', async (_description, destinationUrl) => {
      const response = await create({ destinationUrl });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'DESTINATION_BLOCKED' });
      expect(harness.invalidations).toEqual([]);
    });

    it('refuses a connected short domain, whoever owns it', async () => {
      const other = await createWorkspaceFixture(harness.app);
      await insertDomain(harness, other, 'go.other.test');

      const response = await create({
        destinationUrl: 'https://go.other.test/launch',
      });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'DESTINATION_BLOCKED' });
    });

    it('allows a host that someone has merely claimed', async () => {
      const other = await createWorkspaceFixture(harness.app);
      await insertDomain(harness, other, 'example.com', DomainStatus.Pending);

      const response = await create({ destinationUrl: DESTINATION });

      expect(response.status).toBe(201);
    });
  });

  describe('access', () => {
    it('answers 401 without credentials', async () => {
      harness.signIn(null);

      const response = await create({ destinationUrl: DESTINATION });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('answers 404 for a workspace the caller is not in', async () => {
      const other = await createWorkspaceFixture(harness.app);

      const response = await create({ destinationUrl: DESTINATION }, other);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('answers a malformed workspace id with 400', async () => {
      const response = await harness
        .http()
        .post('/api/v1/workspaces/not-a-uuid/links')
        .send({ destinationUrl: DESTINATION });

      expect(response.status).toBe(400);
    });

    it('lets an API key create a link, audited under the key', async () => {
      const key = apiKeyPrincipal(fixture);
      harness.signIn(key);

      const response = await create({ destinationUrl: DESTINATION });

      expect(response.status).toBe(201);
      expect(harness.auditEntries[0]?.actor).toEqual({
        type: 'api_key',
        id: key.apiKeyId,
      });
    });
  });
});
