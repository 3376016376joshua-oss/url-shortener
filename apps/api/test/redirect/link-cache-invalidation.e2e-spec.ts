import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import {
  Domain,
  DomainStatus,
} from '../../src/database/entities/domain.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { domainKey, linkKey } from '../../src/link-cache/cache-policy.js';
import { LinkCacheInvalidator } from '../../src/link-cache/link-cache-invalidator.js';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../src/redis/redis-client.js';
import { RedirectLinkRepository } from '../../src/redirect/redirect-link.repository.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  PLATFORM_HOST,
  createDomain,
  createLink,
  follow,
} from './redirect-fixtures.js';

const TOMBSTONE_TTL_MS = 5_000;
const BRAND_HOST = 'go.brand.test';

describe('LinkCacheInvalidator', () => {
  let app: NestExpressApplication;
  let redis: RedisClient;
  let invalidator: LinkCacheInvalidator;
  let tenant: WorkspaceFixture;

  beforeAll(async () => {
    app = await createTestApp();
    redis = app.get<RedisClient>(REDIS_CLIENT);
    invalidator = app.get(LinkCacheInvalidator);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetState(app);
    tenant = await createWorkspaceFixture(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const links = () => app.get(DataSource).getRepository(Link);
  const domains = () => app.get(DataSource).getRepository(Domain);

  /** A link that has been followed once, so it is in the cache. */
  const cachedLink = async (
    overrides: Parameters<typeof createLink>[3] = {},
  ): Promise<Link> => {
    const link = await createLink(
      app,
      tenant.domain,
      tenant.workspace.id,
      overrides,
    );
    await follow(app, link.code);
    return link;
  };

  /** What the links workstream does on every write: commit, then invalidate. */
  const change = async (
    link: Link,
    changes: Partial<Pick<Link, 'status' | 'destinationUrl'>>,
  ): Promise<void> => {
    await links().update(link.id, changes);
    await invalidator.invalidateLink(PLATFORM_HOST, link.code);
  };

  describe('after a link changes', () => {
    it('answers 410 on the very next redirect after disabling, and 302 after enabling', async () => {
      const link = await cachedLink();

      await change(link, { status: StoredLinkStatus.Disabled });
      const disabled = await follow(app, link.code);
      await change(link, { status: StoredLinkStatus.Active });
      const enabled = await follow(app, link.code);

      expect(disabled.status).toBe(410);
      expect(enabled.status).toBe(302);
    });

    it('redirects to the new destination', async () => {
      const link = await cachedLink();

      await change(link, { destinationUrl: 'https://example.com/new' });

      const response = await follow(app, link.code);
      expect(response.headers['location']).toBe('https://example.com/new');
    });

    it('answers 404 after deletion', async () => {
      const link = await cachedLink();

      await links().delete(link.id);
      await invalidator.invalidateLink(PLATFORM_HOST, link.code);

      expect((await follow(app, link.code)).status).toBe(404);
    });

    it('redirects a code that was cached as unknown as soon as it is created', async () => {
      await follow(app, 'launch');

      await createLink(app, tenant.domain, tenant.workspace.id, {
        code: 'launch',
      });
      await invalidator.invalidateLink(PLATFORM_HOST, 'launch');

      expect((await follow(app, 'launch')).status).toBe(302);
    });
  });

  describe('tombstones', () => {
    it('replaces the entry with a tombstone that lasts 5 seconds', async () => {
      const link = await cachedLink();
      const key = linkKey(PLATFORM_HOST, link.code);

      await invalidator.invalidateLink(PLATFORM_HOST, link.code);

      expect(await redis.get(key)).toBe('{"invalidated":true}');
      const ttl = await redis.pTTL(key);
      expect(ttl).toBeGreaterThan(TOMBSTONE_TTL_MS - 1_000);
      expect(ttl).toBeLessThanOrEqual(TOMBSTONE_TTL_MS);
    });

    it('matches the host in any case, as the redirect does', async () => {
      const link = await cachedLink();
      await links().update(link.id, { status: StoredLinkStatus.Disabled });

      await invalidator.invalidateLink(PLATFORM_HOST.toUpperCase(), link.code);

      expect((await follow(app, link.code)).status).toBe(410);
    });

    it('is not overwritten by redirects that arrive while it stands', async () => {
      const link = await cachedLink();
      const key = linkKey(PLATFORM_HOST, link.code);
      await invalidator.invalidateLink(PLATFORM_HOST, link.code);

      const response = await follow(app, link.code);

      expect(response.status).toBe(302);
      expect(await redis.get(key)).toBe('{"invalidated":true}');
    });

    it('is followed by a fresh entry once it has expired', async () => {
      const link = await cachedLink();
      const key = linkKey(PLATFORM_HOST, link.code);
      await change(link, { destinationUrl: 'https://example.com/new' });

      // What the passing of 5 seconds does.
      await redis.del(key);
      await follow(app, link.code);

      const entry = JSON.parse((await redis.get(key)) ?? '{}') as {
        destinationUrl?: string;
      };
      expect(entry.destinationUrl).toBe('https://example.com/new');
    });

    it('stops a reader that loaded the old row from caching it after the update', async () => {
      const link = await createLink(app, tenant.domain, tenant.workspace.id, {
        destinationUrl: 'https://example.com/old',
      });
      const repository = app.get(RedirectLinkRepository);
      const find = repository.findByHostAndCode.bind(repository);
      // The reader reads the row, and before it can cache it, a write
      // commits and invalidates.
      vi.spyOn(repository, 'findByHostAndCode').mockImplementationOnce(
        async (host, code) => {
          const oldRow = await find(host, code);
          await change(link, { destinationUrl: 'https://example.com/new' });
          return oldRow;
        },
      );

      const racing = await follow(app, link.code);
      const next = await follow(app, link.code);
      await redis.del(linkKey(PLATFORM_HOST, link.code));
      const later = await follow(app, link.code);

      expect(racing.headers['location']).toBe('https://example.com/old');
      expect(next.headers['location']).toBe('https://example.com/new');
      expect(later.headers['location']).toBe('https://example.com/new');
    });
  });

  describe('after a domain changes', () => {
    const setStatus = async (
      domain: Domain,
      status: DomainStatus,
    ): Promise<void> => {
      await domains().update(domain.id, { status });
      await invalidator.invalidateDomain(domain.hostname);
    };

    it('stops every link on a deactivated domain at once, cached or not', async () => {
      const brand = await createDomain(app, tenant.workspace.id, BRAND_HOST);
      const first = await createLink(app, brand, tenant.workspace.id);
      const second = await createLink(app, brand, tenant.workspace.id);
      await follow(app, first.code, BRAND_HOST);
      await follow(app, second.code, BRAND_HOST);

      await setStatus(brand, DomainStatus.Inactive);

      expect((await follow(app, first.code, BRAND_HOST)).status).toBe(404);
      expect((await follow(app, second.code, BRAND_HOST)).status).toBe(404);
    });

    it('starts serving a domain that was cached as unknown once it is verified', async () => {
      const brand = await createDomain(
        app,
        tenant.workspace.id,
        BRAND_HOST,
        DomainStatus.Pending,
      );
      const link = await createLink(app, brand, tenant.workspace.id);
      expect((await follow(app, link.code, BRAND_HOST)).status).toBe(404);

      await setStatus(brand, DomainStatus.Active);

      expect((await follow(app, link.code, BRAND_HOST)).status).toBe(302);
    });

    it('tombstones the domain key', async () => {
      await invalidator.invalidateDomain(BRAND_HOST);

      expect(await redis.get(domainKey(BRAND_HOST))).toBe(
        '{"invalidated":true}',
      );
    });

    it("never serves the previous owner's cached links when a host changes hands", async () => {
      const previous = await createDomain(app, tenant.workspace.id, BRAND_HOST);
      await createLink(app, previous, tenant.workspace.id, {
        code: 'promo',
        destinationUrl: 'https://old-owner.example/promo',
      });
      await createLink(app, previous, tenant.workspace.id, {
        code: 'sale',
        destinationUrl: 'https://old-owner.example/sale',
      });
      await follow(app, 'promo', BRAND_HOST);
      await follow(app, 'sale', BRAND_HOST);

      const newOwner = await createWorkspaceFixture(app);
      await domains().update(previous.id, { status: DomainStatus.Inactive });
      const current = await createDomain(
        app,
        newOwner.workspace.id,
        BRAND_HOST,
      );
      await invalidator.invalidateDomain(BRAND_HOST);
      await createLink(app, current, newOwner.workspace.id, {
        code: 'promo',
        destinationUrl: 'https://new-owner.example/promo',
      });
      // Past the tombstone, so the new domain itself is cached again.
      await redis.del(domainKey(BRAND_HOST));
      await follow(app, 'warm-the-domain-key', BRAND_HOST);

      const promo = await follow(app, 'promo', BRAND_HOST);
      const sale = await follow(app, 'sale', BRAND_HOST);

      expect(promo.headers['location']).toBe('https://new-owner.example/promo');
      expect(sale.status).toBe(404);
    });
  });
});
