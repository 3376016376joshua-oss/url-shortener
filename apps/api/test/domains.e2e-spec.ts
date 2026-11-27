import { DataSource } from 'typeorm';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainStatus } from '../src/database/entities/domain.entity.js';
import { Link } from '../src/database/entities/link.entity.js';
import { WorkspaceRole } from '../src/database/entities/workspace-member.entity.js';
import { PlatformHosts } from '../src/domains/platform-hosts.js';
import {
  CNAME_TARGET,
  apiKeyFor,
  createDomainTestKit,
  domainListOf,
  domainOf,
  findDomain,
  setDomain,
  withRole,
  type DomainTestKit,
} from './domains/domain-test-kit.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from './support/fixtures.js';
import { resetState } from './support/reset-state.js';

const UNKNOWN_ID = '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a';
const PLATFORM_APP_HOST = 'app.shortener-platform.com';

describe('domains API', () => {
  let kit: DomainTestKit;
  let fixture: WorkspaceFixture;
  let other: WorkspaceFixture;

  const api = () => request(kit.app.getHttpServer());
  const domainsPath = (workspace = fixture) =>
    `/api/v1/workspaces/${workspace.workspace.id}/domains`;
  /** Signs in as the workspace's owner, then adds the host. */
  const claim = (hostname: string, workspace = fixture): Promise<Response> => {
    kit.signIn(workspace.principal);
    return api().post(domainsPath(workspace)).send({ hostname });
  };

  beforeAll(async () => {
    kit = await createDomainTestKit((builder) =>
      builder
        .overrideProvider(PlatformHosts)
        .useValue(new PlatformHosts([PLATFORM_APP_HOST, 'sho.rt'])),
    );
  });

  beforeEach(async () => {
    await resetState(kit.app);
    kit.reset();
    fixture = await createWorkspaceFixture(kit.app);
    other = await createWorkspaceFixture(kit.app);
    kit.signIn(fixture.principal);
  });

  afterAll(async () => {
    await kit.app.close();
  });

  describe('adding a domain', () => {
    it('creates a pending claim and shows the records to publish', async () => {
      const response = await claim('Go.Brand.com');

      expect(response.status).toBe(201);
      const stored = await findDomain(kit.app, domainOf(response).id);
      expect(stored.verificationToken).toMatch(/^sv_[0-9a-f]{32}$/);
      expect(response.body).toEqual({
        id: stored.id,
        hostname: 'go.brand.com',
        status: 'PENDING',
        isPlatformDomain: false,
        dnsRecords: [
          {
            type: 'TXT',
            name: '_shortener-challenge.go.brand.com',
            value: stored.verificationToken,
            verified: false,
          },
          {
            type: 'CNAME',
            name: 'go.brand.com',
            value: CNAME_TARGET,
            verified: false,
          },
        ],
        verifiedAt: null,
        lastCheckedAt: stored.lastCheckedAt?.toISOString(),
        createdAt: stored.createdAt.toISOString(),
      });
      expect(stored.lastCheckedAt).not.toBeNull();
    });

    it('records who added it in the audit log', async () => {
      const response = await claim('go.brand.com');

      expect(kit.recordAudit).toHaveBeenCalledWith({
        workspaceId: fixture.workspace.id,
        actor: { type: 'user', id: fixture.user.id },
        action: 'domain.created',
        target: { type: 'domain', id: domainOf(response).id },
        metadata: { hostname: 'go.brand.com' },
      });
    });

    it.each([
      ['an IPv4 address', { hostname: '203.0.113.10' }],
      ['an IPv6 address', { hostname: '2001:db8::1' }],
      ['a single label', { hostname: 'intranet' }],
      ['a URL', { hostname: 'https://go.brand.com' }],
      ['a private name', { hostname: 'links.internal' }],
      ['a missing host name', {}],
      ['an unknown property', { hostname: 'go.brand.com', status: 'ACTIVE' }],
    ])('refuses %s with 400', async (_reason, body) => {
      const response = await api().post(domainsPath()).send(body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it.each([PLATFORM_APP_HOST, 'sho.rt', 'links.sho.rt'])(
      'refuses the platform host %s with 409',
      async (hostname) => {
        const response = await claim(hostname);

        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: 'CONFLICT' });
      },
    );

    it('refuses a host a platform admin has blocked with 409', async () => {
      const blocked = await claim('go.brand.com', other);
      await setDomain(kit.app, domainOf(blocked).id, {
        status: DomainStatus.Blocked,
      });

      const response = await claim('go.brand.com');

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'CONFLICT' });
    });

    it('refuses a host the workspace has already added with 409', async () => {
      await claim('go.brand.com');

      const response = await claim('GO.brand.com');

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'CONFLICT' });
    });

    it('lets two workspaces claim one host without telling either', async () => {
      const first = await claim('go.brand.com');
      const second = await claim('go.brand.com', other);

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(domainOf(second).id).not.toBe(domainOf(first).id);
      const tokens = [first, second].map(
        (response) => domainOf(response).dnsRecords[0]?.value,
      );
      expect(tokens[0]).not.toBe(tokens[1]);
      expect(JSON.stringify(second.body)).not.toContain(tokens[0]);
      const listed = await api().get(domainsPath(other));
      expect(JSON.stringify(listed.body)).not.toContain(domainOf(first).id);
    });

    it('refuses the eleventh domain with 422 QUOTA_EXCEEDED', async () => {
      for (let index = 1; index <= 10; index += 1) {
        expect((await claim(`go${index}.brand.com`)).status).toBe(201);
      }

      const response = await claim('go11.brand.com');

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
      expect((await claim('go11.brand.com', other)).status).toBe(201);
    });
  });

  describe('reading domains', () => {
    it('lists the platform domain first, then the workspace own', async () => {
      await claim('b.brand.com');
      await claim('a.brand.com');
      await claim('other.brand.com', other);
      kit.signIn(fixture.principal);

      const response = await api().get(domainsPath());

      expect(response.status).toBe(200);
      expect(domainListOf(response).nextCursor).toBeNull();
      expect(domainListOf(response).items.map((item) => item.hostname)).toEqual(
        [fixture.domain.hostname, 'b.brand.com', 'a.brand.com'],
      );
      expect(domainListOf(response).items[0]).toMatchObject({
        id: fixture.domain.id,
        status: 'ACTIVE',
        isPlatformDomain: true,
        dnsRecords: [],
      });
    });

    it('returns one of its own domains, and the platform domain', async () => {
      const created = await claim('go.brand.com');

      const own = await api().get(`${domainsPath()}/${domainOf(created).id}`);
      const platform = await api().get(`${domainsPath()}/${fixture.domain.id}`);

      expect(own.status).toBe(200);
      expect(own.body).toEqual(created.body);
      expect(platform.status).toBe(200);
      expect(platform.body).toMatchObject({ isPlatformDomain: true });
    });

    it("answers 404 for another workspace's domain and an unknown id", async () => {
      const foreign = await claim('go.brand.com', other);
      kit.signIn(fixture.principal);

      for (const id of [domainOf(foreign).id, UNKNOWN_ID]) {
        const response = await api().get(`${domainsPath()}/${id}`);

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
      }
    });

    it('answers 400 for an id that is not a UUID', async () => {
      const response = await api().get(`${domainsPath()}/not-a-uuid`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('removing a domain', () => {
    const insertLink = (domainId: string): Promise<Link> =>
      kit.app.get(DataSource).getRepository(Link).save({
        workspaceId: fixture.workspace.id,
        domainId,
        code: 'launch',
        destinationUrl: 'https://example.com/landing',
      });

    it('removes a domain with no links, and stops serving it', async () => {
      const created = await claim('go.brand.com');
      const path = `${domainsPath()}/${domainOf(created).id}`;

      const response = await api().delete(path);

      expect(response.status).toBe(204);
      expect((await api().get(path)).status).toBe(404);
      expect(kit.invalidateDomain).toHaveBeenCalledWith('go.brand.com');
      expect(kit.recordAudit).toHaveBeenLastCalledWith({
        workspaceId: fixture.workspace.id,
        actor: { type: 'user', id: fixture.user.id },
        action: 'domain.deleted',
        target: { type: 'domain', id: domainOf(created).id },
        metadata: { hostname: 'go.brand.com' },
      });
    });

    it('refuses with 409 while links remain, then succeeds', async () => {
      const created = await claim('go.brand.com');
      const path = `${domainsPath()}/${domainOf(created).id}`;
      const link = await insertLink(domainOf(created).id);

      const refused = await api().delete(path);

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'CONFLICT' });
      expect((await api().get(path)).status).toBe(200);
      await kit.app.get(DataSource).getRepository(Link).delete({ id: link.id });
      expect((await api().delete(path)).status).toBe(204);
    });

    it('refuses to remove a blocked domain, which would lift the block', async () => {
      const created = await claim('go.brand.com');
      await setDomain(kit.app, domainOf(created).id, {
        status: DomainStatus.Blocked,
      });

      const response = await api().delete(
        `${domainsPath()}/${domainOf(created).id}`,
      );

      expect(response.status).toBe(409);
      expect((await claim('go.brand.com', other)).status).toBe(409);
    });

    it('answers 404 for the platform domain and for another workspace', async () => {
      const foreign = await claim('go.brand.com', other);
      kit.signIn(fixture.principal);

      for (const id of [fixture.domain.id, domainOf(foreign).id]) {
        expect((await api().delete(`${domainsPath()}/${id}`)).status).toBe(404);
        expect((await api().post(`${domainsPath()}/${id}/verify`)).status).toBe(
          404,
        );
      }
      await expect(
        findDomain(kit.app, fixture.domain.id),
      ).resolves.toBeDefined();
    });
  });

  describe('authorisation', () => {
    let domainPath: string;

    beforeEach(async () => {
      const created = await claim('go.brand.com');
      domainPath = `${domainsPath()}/${domainOf(created).id}`;
    });

    /** In order, one at a time: the last route removes the domain. */
    const statuses = async (): Promise<number[]> => {
      const routes: Array<() => Promise<Response>> = [
        () => api().get(domainsPath()),
        () => api().post(domainsPath()).send({ hostname: 'new.brand.com' }),
        () => api().get(domainPath),
        () => api().post(`${domainPath}/verify`),
        () => api().delete(domainPath),
      ];
      const seen: number[] = [];
      for (const route of routes) {
        seen.push((await route()).status);
      }
      return seen;
    };

    it('answers 401 on every route without credentials', async () => {
      kit.signIn(null);

      expect(await statuses()).toEqual([401, 401, 401, 401, 401]);
    });

    it('answers 404 on every route for a user outside the workspace', async () => {
      kit.signIn(other.principal);

      expect(await statuses()).toEqual([404, 404, 404, 404, 404]);
    });

    it.each([
      ['a member', () => withRole(fixture.principal, WorkspaceRole.Member)],
      ['an API key', () => apiKeyFor(fixture.workspace.id)],
    ])(
      'lets %s read but not add, verify, or remove',
      async (_who, principal) => {
        kit.signIn(principal());

        expect(await statuses()).toEqual([200, 403, 200, 403, 403]);
      },
    );

    it('lets an admin do everything', async () => {
      kit.signIn(withRole(fixture.principal, WorkspaceRole.Admin));

      expect(await statuses()).toEqual([200, 201, 200, 200, 204]);
    });
  });
});
