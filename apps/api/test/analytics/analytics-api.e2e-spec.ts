import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  linkAnalyticsSchema,
  type LinkAnalytics,
} from '@url-shortener/contracts/analytics';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Link } from '../../src/database/entities/link.entity.js';
import { WorkspaceRole } from '../../src/database/entities/workspace-member.entity.js';
import type { Principal } from '../../src/identity/principal.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  authenticatedAs,
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  GOOGLEBOT,
  clickOn,
  clockAt,
  customizeWith,
  getApi,
  insertLink,
  recordAndConsume,
} from './support.js';

const NOW = new Date('2026-11-27T15:30:00Z');
const at = (time: string): Date => new Date(time);

describe('link analytics API', () => {
  let app: NestExpressApplication;
  let fixture: WorkspaceFixture;
  let principal: Principal | null;
  let link: Link;

  const linkPath = (linkId = link.id, workspaceId = fixture.workspace.id) =>
    `/workspaces/${workspaceId}/links/${linkId}/analytics`;

  const linkAnalytics = async (
    query: Record<string, string | number> = {},
  ): Promise<LinkAnalytics> => {
    const response = await getApi(app, linkPath(), query);
    expect(response.status).toBe(200);
    return linkAnalyticsSchema.parse(response.body);
  };

  beforeAll(async () => {
    app = await createTestApp(
      customizeWith(
        authenticatedAs(() => principal),
        clockAt(() => NOW),
      ),
    );
  });

  beforeEach(async () => {
    await resetState(app);
    fixture = await createWorkspaceFixture(app);
    principal = fixture.principal;
    link = await insertLink(app, fixture, { title: 'Spring launch' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /workspaces/{id}/links/{linkId}/analytics', () => {
    it('returns zeros and empty breakdowns for a link nobody has clicked', async () => {
      const result = await linkAnalytics();

      expect(result.range).toEqual({
        from: '2026-10-29',
        to: '2026-11-27',
        interval: 'day',
      });
      expect(result.totals).toEqual({ clicks: 0, uniqueVisitors: 0 });
      expect(result.series).toHaveLength(30);
      expect(result.series.at(-1)).toEqual({
        bucket: '2026-11-27',
        clicks: 0,
        uniqueVisitors: 0,
      });
      expect(Object.keys(result.breakdowns)).toEqual([
        'country',
        'device',
        'os',
        'browser',
        'referrer',
        'source',
        'variant',
      ]);
      expect(Object.values(result.breakdowns).flat()).toEqual([]);
    });

    it('returns totals and a daily series over the range, days without clicks included', async () => {
      await recordAndConsume(app, [
        clickOn(link.id, { clickedAt: at('2026-11-25T08:00:00Z') }),
        clickOn(link.id, { clickedAt: at('2026-11-27T09:00:00Z') }),
        clickOn(link.id, {
          clickedAt: at('2026-11-27T10:00:00Z'),
          ip: '10.9.9.9',
        }),
        clickOn(link.id, { clickedAt: at('2026-11-20T10:00:00Z') }),
      ]);

      const result = await linkAnalytics({
        from: '2026-11-25',
        to: '2026-11-27',
      });

      expect(result.totals).toEqual({ clicks: 3, uniqueVisitors: 3 });
      expect(result.series).toEqual([
        { bucket: '2026-11-25', clicks: 1, uniqueVisitors: 1 },
        { bucket: '2026-11-26', clicks: 0, uniqueVisitors: 0 },
        { bucket: '2026-11-27', clicks: 2, uniqueVisitors: 2 },
      ]);
    });

    it('lists the top values of a dimension and sums the rest as other', async () => {
      const referrers = [
        ...Array<string>(4).fill('https://a.example/'),
        ...Array<string>(3).fill('https://b.example/'),
        ...Array<string>(2).fill('https://c.example/'),
        'https://d.example/',
      ];
      await recordAndConsume(
        app,
        referrers.map((referrer) => clickOn(link.id, { referrer })),
      );

      const { breakdowns } = await linkAnalytics({ top: 2 });

      expect(breakdowns.referrer).toEqual([
        { value: 'a.example', clicks: 4 },
        { value: 'b.example', clicks: 3 },
        { value: 'other', clicks: 3 },
      ]);
      expect(breakdowns.source).toEqual([{ value: 'link', clicks: 10 }]);
    });

    it('returns an hourly series for a 7 day range, without bots or unique visitors', async () => {
      await recordAndConsume(app, [
        clickOn(link.id, { clickedAt: at('2026-11-21T00:00:00Z') }),
        clickOn(link.id, { clickedAt: at('2026-11-27T13:05:00Z') }),
        clickOn(link.id, { clickedAt: at('2026-11-27T13:55:00Z') }),
        clickOn(link.id, {
          clickedAt: at('2026-11-27T13:30:00Z'),
          userAgent: GOOGLEBOT,
        }),
      ]);

      const result = await linkAnalytics({
        from: '2026-11-21',
        to: '2026-11-27',
        interval: 'hour',
      });

      expect(result.range.interval).toBe('hour');
      expect(result.series).toHaveLength(7 * 24);
      expect(result.series[0]).toEqual({
        bucket: '2026-11-21T00:00:00.000Z',
        clicks: 1,
      });
      expect(result.series.filter(({ clicks }) => clicks > 0)).toEqual([
        { bucket: '2026-11-21T00:00:00.000Z', clicks: 1 },
        { bucket: '2026-11-27T13:00:00.000Z', clicks: 2 },
      ]);
      expect(result.totals).toEqual({ clicks: 3, uniqueVisitors: 2 });
    });

    it.each([
      [
        'an hourly range longer than 7 days',
        { from: '2026-11-20', to: '2026-11-27', interval: 'hour' },
      ],
      [
        'an hourly range older than raw events are kept',
        { from: '2026-08-01', to: '2026-08-02', interval: 'hour' },
      ],
      [
        'a range that ends before it starts',
        { from: '2026-11-27', to: '2026-11-01' },
      ],
      ['a date that does not exist', { from: '2026-02-30' }],
      ['a date in another format', { to: '27/11/2026' }],
      ['an unknown interval', { interval: 'minute' }],
      ['a top of zero', { top: 0 }],
      ['a top above the maximum', { top: 51 }],
      ['an unknown parameter', { groupBy: 'city' }],
    ])('refuses %s with 400', async (_reason, query) => {
      const response = await getApi(app, linkPath(), query);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('answers 400 for ids that are not UUIDs', async () => {
      const response = await getApi(app, linkPath('launch'));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('answers 404 for a link that does not exist, or was deleted', async () => {
      await recordAndConsume(app, [clickOn(link.id)]);
      await app.get(DataSource).getRepository(Link).delete({ id: link.id });

      const response = await getApi(app, linkPath());

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it("answers 404 for another workspace's link, under either workspace", async () => {
      const stranger = await createWorkspaceFixture(app);
      const theirs = await insertLink(app, stranger);

      const viaMine = await getApi(app, linkPath(theirs.id));
      const viaTheirs = await getApi(
        app,
        linkPath(theirs.id, stranger.workspace.id),
      );

      expect(viaMine.status).toBe(404);
      expect(viaTheirs.status).toBe(404);
      expect(viaTheirs.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('answers 401 without credentials', async () => {
      principal = null;

      const response = await getApi(app, linkPath());

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('lets an API key of the workspace read analytics', async () => {
      principal = {
        kind: 'api_key',
        userId: null,
        apiKeyId: '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a',
        isPlatformAdmin: false,
        memberships: [
          { workspaceId: fixture.workspace.id, role: WorkspaceRole.Member },
        ],
      };

      const response = await getApi(app, linkPath());

      expect(response.status).toBe(200);
    });
  });
});
