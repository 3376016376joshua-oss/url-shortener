import { DataSource } from 'typeorm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ApiKey } from '../../src/database/entities/api-key.entity.js';
import { AuditLogEntry } from '../../src/database/entities/audit-log-entry.entity.js';
import {
  Domain,
  DomainStatus,
} from '../../src/database/entities/domain.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { WorkspaceMember } from '../../src/database/entities/workspace-member.entity.js';
import { Workspace } from '../../src/database/entities/workspace.entity.js';
import { LinkCacheInvalidator } from '../../src/link-cache/link-cache-invalidator.js';
import {
  as,
  createAccount,
  createIdentityHarness,
  type Account,
  type IdentityHarness,
} from '../identity/identity-harness.js';
import {
  createDomain,
  createLink,
  follow,
} from '../redirect/redirect-fixtures.js';
import { testEnv } from '../support/test-env.js';

/** More than two deletion batches, so batching is exercised. */
const LINK_COUNT = 230;

describe('workspace deletion (ID-5, AC-51)', () => {
  let harness: IdentityHarness;
  let dataSource: DataSource;
  let owner: Account;
  /** What the cache was told, and whether the row was already gone. */
  const invalidatedLinks: Array<{ key: string; rowGone: boolean }> = [];
  const invalidateDomain = vi.fn(() => Promise.resolve());

  const workspacePath = (account: Account) =>
    `/api/v1/workspaces/${account.workspaceId}`;

  beforeAll(async () => {
    harness = await createIdentityHarness((builder) =>
      builder.overrideProvider(LinkCacheInvalidator).useValue({
        invalidateLink: async (hostname: string, code: string) => {
          const remaining = await dataSource
            .getRepository(Link)
            .countBy({ code });
          invalidatedLinks.push({
            key: `${hostname}/${code}`,
            rowGone: remaining === 0,
          });
        },
        invalidateDomain,
      }),
    );
    dataSource = harness.app.get(DataSource);
  });

  beforeEach(async () => {
    await harness.reset();
    invalidatedLinks.length = 0;
    invalidateDomain.mockClear();
    owner = await createAccount(harness);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  describe('deletion', () => {
    const insertDomain = (workspaceId: string | null, hostname: string) =>
      dataSource.getRepository(Domain).save({
        workspaceId,
        hostname,
        status: DomainStatus.Active,
        verificationToken: 'token',
        verifiedAt: new Date(),
      });

    const insertLinks = (
      workspaceId: string,
      domainId: string,
      codes: string[],
    ) =>
      dataSource.getRepository(Link).insert(
        codes.map((code) => ({
          workspaceId,
          domainId,
          code,
          destinationUrl: 'https://example.com/landing',
        })),
      );

    it('deletes links, domains, keys, and members, and invalidates every cache entry after its row is gone', async () => {
      const bystander = await createAccount(harness);
      const platform = await insertDomain(null, testEnv.DEFAULT_SHORT_DOMAIN);
      const custom = await insertDomain(owner.workspaceId, 'go.brand.test');
      const codes = Array.from({ length: LINK_COUNT }, (_, n) => `code${n}`);
      await insertLinks(owner.workspaceId, platform.id, codes);
      await insertLinks(owner.workspaceId, custom.id, ['launch']);
      await insertLinks(bystander.workspaceId, platform.id, ['theirs']);
      await as(harness.app, owner.cookie)
        .post(`${workspacePath(owner)}/api-keys`)
        .send({ name: 'CI' })
        .expect(201);

      const response = await as(harness.app, owner.cookie).delete(
        workspacePath(owner),
      );

      expect(response.status).toBe(204);
      expect(invalidatedLinks.map(({ key }) => key).sort()).toEqual(
        [
          ...codes.map((code) => `${testEnv.DEFAULT_SHORT_DOMAIN}/${code}`),
          'go.brand.test/launch',
        ].sort(),
      );
      expect(invalidatedLinks.every(({ rowGone }) => rowGone)).toBe(true);
      expect(invalidateDomain.mock.calls).toEqual([['go.brand.test']]);

      const { workspaceId } = owner;
      expect(
        await dataSource.getRepository(Workspace).countBy({ id: workspaceId }),
      ).toBe(0);
      expect(
        await dataSource.getRepository(Link).countBy({ workspaceId }),
      ).toBe(0);
      expect(
        await dataSource.getRepository(Domain).countBy({ workspaceId }),
      ).toBe(0);
      expect(
        await dataSource.getRepository(ApiKey).countBy({ workspaceId }),
      ).toBe(0);
      expect(
        await dataSource
          .getRepository(WorkspaceMember)
          .countBy({ workspaceId }),
      ).toBe(0);
      // Nothing of anyone else's is touched.
      expect(
        await dataSource.getRepository(Link).countBy({ code: 'theirs' }),
      ).toBe(1);
      expect(
        await dataSource.getRepository(Domain).countBy({ id: platform.id }),
      ).toBe(1);
    });

    it('leaves the owner signed in, without the workspace, and a platform-level audit entry', async () => {
      const response = await as(harness.app, owner.cookie).delete(
        workspacePath(owner),
      );

      expect(response.status).toBe(204);
      const me = await as(harness.app, owner.cookie).get('/api/v1/me');
      expect(me.body).toMatchObject({ workspaces: [] });
      expect(
        (await as(harness.app, owner.cookie).get(workspacePath(owner))).status,
      ).toBe(404);
      const entry = await dataSource
        .getRepository(AuditLogEntry)
        .findOneBy({ action: 'workspace.deleted' });
      expect(entry).toMatchObject({
        workspaceId: null,
        actorId: owner.userId,
        targetId: owner.workspaceId,
        metadata: { name: `${owner.name}'s workspace` },
      });
    });
  });
});

describe('workspace deletion, seen by a visitor (AC-51)', () => {
  let harness: IdentityHarness;

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });

  beforeEach(() => harness.reset());

  afterAll(async () => {
    await harness.app.close();
  });

  it('makes cached links answer 404 on the very next request', async () => {
    const { app } = harness;
    const owner = await createAccount(harness);
    const platform = await app.get(DataSource).getRepository(Domain).save({
      workspaceId: null,
      hostname: testEnv.DEFAULT_SHORT_DOMAIN,
      status: DomainStatus.Active,
      verificationToken: 'platform-domain',
    });
    const custom = await createDomain(app, owner.workspaceId, 'go.brand.test');
    const onPlatform = await createLink(app, platform, owner.workspaceId);
    const onCustom = await createLink(app, custom, owner.workspaceId);
    // Followed twice, so both the link and its domain are served from cache.
    for (let visit = 0; visit < 2; visit += 1) {
      await follow(app, onPlatform.code).expect(302);
      await follow(app, onCustom.code, 'go.brand.test').expect(302);
    }

    await as(app, owner.cookie)
      .delete(`/api/v1/workspaces/${owner.workspaceId}`)
      .expect(204);

    expect((await follow(app, onPlatform.code)).status).toBe(404);
    expect((await follow(app, onCustom.code, 'go.brand.test')).status).toBe(
      404,
    );
  });
});
