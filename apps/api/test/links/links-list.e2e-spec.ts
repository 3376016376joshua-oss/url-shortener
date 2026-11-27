import {
  linkListSchema,
  type LinkListResponse,
} from '@url-shortener/contracts/links';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import { LinkVariant } from '../../src/database/entities/link-variant.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  createLinksHarness,
  insertDomain,
  linksPath,
  type LinksHarness,
} from './links-harness.js';

const DESTINATION = 'https://example.com/landing';
const PAST = new Date('2020-01-01T00:00:00Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');

type LinkSeed = Partial<
  Pick<
    Link,
    'code' | 'title' | 'destinationUrl' | 'status' | 'expiresAt' | 'domainId'
  >
>;

describe('listing links', () => {
  let harness: LinksHarness;
  let fixture: WorkspaceFixture;

  /** One INSERT statement, so every row gets the same `created_at`. */
  const insertLinks = async (
    rows: LinkSeed[],
    target = fixture,
  ): Promise<void> => {
    await harness.dataSource.getRepository(Link).insert(
      rows.map((row) => ({
        workspaceId: target.workspace.id,
        domainId: target.domain.id,
        destinationUrl: DESTINATION,
        ...row,
      })),
    );
  };

  const list = async (
    query: Record<string, string | number> = {},
  ): Promise<LinkListResponse> => {
    const response = await harness.http().get(linksPath(fixture)).query(query);
    expect(response.status).toBe(200);
    return linkListSchema.parse(response.body);
  };

  const codes = async (
    query: Record<string, string | number> = {},
  ): Promise<string[]> =>
    (await list(query)).items.map(({ code }) => code).sort();

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

  it('returns an empty page for a workspace without links', async () => {
    expect(await list()).toEqual({ items: [], nextCursor: null });
  });

  it('returns the newest link first, as full link resources', async () => {
    await insertLinks([{ code: 'older' }]);
    await insertLinks([{ code: 'newer', title: 'Newer' }]);
    const [newer] = await harness.dataSource
      .getRepository(Link)
      .findBy({ code: 'newer' });
    await harness.dataSource.getRepository(LinkVariant).insert([
      { linkId: newer?.id, name: 'B', destinationUrl: DESTINATION, weight: 10 },
      {
        linkId: newer?.id,
        name: 'Old',
        destinationUrl: DESTINATION,
        weight: 10,
        archivedAt: PAST,
      },
    ]);

    const page = await list();

    expect(page.items.map(({ code }) => code)).toEqual(['newer', 'older']);
    expect(page.items[0]).toMatchObject({
      shortUrl: 'http://sho.test/newer',
      title: 'Newer',
      variantCount: 1,
    });
    expect(page.nextCursor).toBeNull();
  });

  it("never shows another workspace's links", async () => {
    const other = await createWorkspaceFixture(harness.app);
    await insertLinks([{ code: 'mine' }]);
    await insertLinks([{ code: 'theirs' }], other);

    expect(await codes()).toEqual(['mine']);
  });

  it('pages through 60 links without repeating or skipping one', async () => {
    const batch = (prefix: string): LinkSeed[] =>
      Array.from({ length: 20 }, (_unused, index) => ({
        code: `${prefix}${String(index).padStart(2, '0')}`,
      }));
    // Rows of one batch share a creation time, so the id breaks the tie.
    for (const prefix of ['aaa', 'bbb', 'ccc']) {
      await insertLinks(batch(prefix));
    }
    const expected = (
      await harness.dataSource
        .getRepository(Link)
        .find({ order: { createdAt: 'DESC', id: 'DESC' } })
    ).map(({ code }) => code);

    const seen: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | null = null;
    do {
      const page: LinkListResponse = await list({
        limit: 25,
        ...(cursor !== null && { cursor }),
      });
      seen.push(...page.items.map(({ code }) => code));
      pageSizes.push(page.items.length);
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(pageSizes).toEqual([25, 25, 10]);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(60);
  });

  it('ends exactly at the last row without an empty extra page', async () => {
    await insertLinks([{ code: 'one' }, { code: 'two' }]);

    const page = await list({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('applies the filters to every page', async () => {
    await insertLinks(
      ['keep1', 'drop1', 'keep2', 'drop2', 'keep3'].map((code) => ({ code })),
    );

    const first = await list({ search: 'keep', limit: 2 });
    const second = await list({
      search: 'keep',
      limit: 2,
      cursor: first.nextCursor ?? '',
    });

    expect(
      [...first.items, ...second.items].map(({ code }) => code).sort(),
    ).toEqual(['keep1', 'keep2', 'keep3']);
    expect(second.nextCursor).toBeNull();
  });

  describe('search', () => {
    beforeEach(async () => {
      await insertLinks([
        { code: 'Spring26', title: 'Launch day' },
        { code: 'promo', title: 'SPRING sale' },
        { code: 'docs', destinationUrl: 'https://spring.example/guide' },
        { code: 'other', title: '100% off_now' },
        { code: 'plain', title: 'Nothing here' },
      ]);
    });

    it('matches code, title, and destination, ignoring case', async () => {
      expect(await codes({ search: 'spring' })).toEqual([
        'Spring26',
        'docs',
        'promo',
      ]);
    });

    it('treats an empty search as no search', async () => {
      expect(await codes({ search: '' })).toHaveLength(5);
    });

    it.each([
      ['%', ['other']],
      ['_', ['other']],
      ['100% off_', ['other']],
      ['no such link', []],
    ])('matches %j literally', async (search, expected) => {
      expect(await codes({ search })).toEqual(expected);
    });
  });

  describe('filters', () => {
    let custom: { id: string };

    beforeEach(async () => {
      custom = await insertDomain(harness, fixture, 'go.brand.test');
      await insertLinks([
        { code: 'active' },
        { code: 'future', expiresAt: FUTURE },
        { code: 'expired', expiresAt: PAST },
        { code: 'disabled', status: StoredLinkStatus.Disabled },
        {
          code: 'disabledPast',
          status: StoredLinkStatus.Disabled,
          expiresAt: PAST,
        },
        { code: 'blocked', status: StoredLinkStatus.Blocked },
        { code: 'branded', domainId: custom.id },
      ]);
    });

    it.each([
      ['ACTIVE', ['active', 'branded', 'future']],
      ['EXPIRED', ['expired']],
      ['DISABLED', ['disabled', 'disabledPast']],
      ['BLOCKED', ['blocked']],
    ])('filters by the effective status %s', async (status, expected) => {
      const page = await list({ status });

      expect(page.items.map(({ code }) => code).sort()).toEqual(expected);
      expect(new Set(page.items.map((item) => item.status))).toEqual(
        new Set([status]),
      );
    });

    it('filters by domain', async () => {
      expect(await codes({ domainId: custom.id })).toEqual(['branded']);
      expect(await codes({ domainId: fixture.domain.id })).toHaveLength(6);
    });

    it('combines search, status, and domain', async () => {
      expect(
        await codes({
          search: 'e',
          status: 'ACTIVE',
          domainId: fixture.domain.id,
        }),
      ).toEqual(['active', 'future']);
    });
  });

  it.each([
    ['a limit of 0', { limit: 0 }],
    ['a limit over 100', { limit: 101 }],
    ['an unknown status', { status: 'DELETED' }],
    ['a malformed domain id', { domainId: 'sho.test' }],
    ['a cursor it did not issue', { cursor: 'bm90LWEtY3Vyc29y' }],
  ])('answers %s with 400', async (_description, query) => {
    const response = await harness.http().get(linksPath(fixture)).query(query);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('answers 404 for a workspace the caller is not in', async () => {
    const other = await createWorkspaceFixture(harness.app);

    const response = await harness.http().get(linksPath(other));

    expect(response.status).toBe(404);
  });
});
