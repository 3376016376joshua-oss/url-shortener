import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  workspaceAnalyticsSchema,
  type WorkspaceAnalytics,
} from '@url-shortener/contracts/analytics';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Link } from '../../src/database/entities/link.entity.js';
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

describe('workspace analytics API: GET /workspaces/{id}/analytics', () => {
  let app: NestExpressApplication;
  let fixture: WorkspaceFixture;
  let principal: Principal | null;
  let link: Link;

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

  const overview = async (
    query: Record<string, string> = {},
  ): Promise<WorkspaceAnalytics> => {
    const response = await getApi(
      app,
      `/workspaces/${fixture.workspace.id}/analytics`,
      query,
    );
    expect(response.status).toBe(200);
    return workspaceAnalyticsSchema.parse(response.body);
  };

  it('returns totals, a daily series, and the top links of the workspace only', async () => {
    const quiet = await insertLink(app, fixture);
    const busy = await insertLink(app, fixture, { title: 'Busy' });
    const stranger = await createWorkspaceFixture(app);
    const theirs = await insertLink(app, stranger);
    await recordAndConsume(app, [
      clickOn(link.id, { clickedAt: at('2026-11-26T10:00:00Z') }),
      clickOn(busy.id, { ip: '10.1.0.1' }),
      clickOn(busy.id, { ip: '10.2.0.1' }),
      clickOn(busy.id, { ip: '10.3.0.1' }),
      clickOn(theirs.id),
      clickOn(theirs.id, { userAgent: GOOGLEBOT }),
    ]);

    const result = await overview({ from: '2026-11-26', to: '2026-11-27' });

    expect(result.range).toEqual({
      from: '2026-11-26',
      to: '2026-11-27',
      interval: 'day',
    });
    expect(result.totals).toEqual({ clicks: 4, uniqueVisitors: 4 });
    expect(result.series).toEqual([
      { bucket: '2026-11-26', clicks: 1, uniqueVisitors: 1 },
      { bucket: '2026-11-27', clicks: 3, uniqueVisitors: 3 },
    ]);
    const domain = {
      id: fixture.domain.id,
      hostname: fixture.domain.hostname,
    };
    expect(result.topLinks).toEqual([
      { id: busy.id, domain, code: busy.code, title: 'Busy', clicks: 3 },
      {
        id: link.id,
        domain,
        code: link.code,
        title: 'Spring launch',
        clicks: 1,
      },
    ]);
    expect(result.topLinks.map(({ id }) => id)).not.toContain(quiet.id);
  });

  it('ranks at most ten links, most clicked first', async () => {
    const clicks = [];
    for (let rank = 1; rank <= 12; rank += 1) {
      const ranked = await insertLink(app, fixture);
      clicks.push(...Array.from({ length: rank }, () => clickOn(ranked.id)));
    }
    await recordAndConsume(app, clicks);

    const { topLinks, totals } = await overview();

    expect(topLinks.map((top) => top.clicks)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3,
    ]);
    expect(totals.clicks).toBe(78);
  });

  it('defaults to the last 30 days', async () => {
    const result = await overview();

    expect(result.range).toMatchObject({
      from: '2026-10-29',
      to: '2026-11-27',
    });
    expect(result.series).toHaveLength(30);
    expect(result.topLinks).toEqual([]);
  });

  it('answers 404 to someone outside the workspace, and 401 to nobody', async () => {
    const stranger = await createWorkspaceFixture(app);
    const path = `/workspaces/${stranger.workspace.id}/analytics`;

    const outsider = await getApi(app, path);
    principal = null;
    const anonymous = await getApi(app, path);

    expect(outsider.status).toBe(404);
    expect(outsider.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(anonymous.status).toBe(401);
  });

  it('refuses an interval, which the overview does not take', async () => {
    const response = await getApi(
      app,
      `/workspaces/${fixture.workspace.id}/analytics`,
      { interval: 'hour' },
    );

    expect(response.status).toBe(400);
  });
});
