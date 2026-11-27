import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { LinkAnalytics } from '@url-shortener/contracts/analytics';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLICK_STREAM_KEY } from '../../src/analytics/redis-keys.js';
import { CountryResolver } from '../../src/analytics/recorder/country-resolver.js';
import { GeoIpCountryResolver } from '../../src/analytics/recorder/geoip-country-resolver.js';
import type { Env } from '../../src/config/env.schema.js';
import { LinkVariant } from '../../src/database/entities/link-variant.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  authenticatedAs,
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import { writeCountryDatabase } from './mmdb-fixture.js';
import {
  GOOGLEBOT,
  IPHONE_SAFARI,
  WINDOWS_CHROME,
  clickOn,
  consumeClicks,
  countRows,
  customizeWith,
  getApi,
  insertLink,
  recordAndConsume,
  recordClicks,
  redisOf,
  streamMessages,
  waitFor,
} from './support.js';

const GERMAN_IP = '203.0.113.7';
const AMERICAN_IP = '198.51.100.23';
const UNLISTED_IP = '192.0.2.1';
const DAY = { from: '2026-11-27', to: '2026-11-27' };

/** Looks countries up in a real database file, as production does. */
const countriesFrom =
  (path: string) =>
  (builder: TestingModuleBuilder): TestingModuleBuilder =>
    builder.overrideProvider(CountryResolver).useValue(
      new GeoIpCountryResolver({
        get: () => path,
      } as unknown as ConfigService<Env, true>),
    );

describe('click pipeline', () => {
  let app: NestExpressApplication;
  let directory: string;
  let fixture: WorkspaceFixture;
  let link: Link;

  const analytics = async (
    query: Record<string, string | number> = DAY,
  ): Promise<LinkAnalytics> => {
    const response = await getApi(
      app,
      `/workspaces/${fixture.workspace.id}/links/${link.id}/analytics`,
      query,
    );
    expect(response.status).toBe(200);
    return response.body as LinkAnalytics;
  };

  const reloadLink = (): Promise<Link> =>
    app.get(DataSource).getRepository(Link).findOneByOrFail({ id: link.id });

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'analytics-geoip-'));
    const database = join(directory, 'countries.mmdb');
    await writeCountryDatabase(database, {
      '203.0.113.0/24': 'DE',
      '198.51.100.0/24': 'US',
    });
    app = await createTestApp(
      customizeWith(
        authenticatedAs(() => fixture.principal),
        countriesFrom(database),
      ),
    );
  });

  beforeEach(async () => {
    await resetState(app);
    fixture = await createWorkspaceFixture(app);
    link = await insertLink(app, fixture);
  });

  afterAll(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });

  it('counts N clicks as a total of N, on the link and in its analytics', async () => {
    const clicks = Array.from({ length: 25 }, (_unused, index) =>
      clickOn(link.id, { ip: `203.0.113.${index + 1}` }),
    );

    await recordAndConsume(app, clicks);

    expect((await analytics()).totals.clicks).toBe(25);
    expect((await reloadLink()).clickCount).toBe('25');
    expect(await countRows(app, 'click_events')).toBe(25);
  });

  it('changes nothing when the same events are delivered again', async () => {
    await recordAndConsume(app, [clickOn(link.id), clickOn(link.id)]);
    const before = await analytics();
    const redis = redisOf(app);

    for (const message of await streamMessages(app)) {
      await redis.xAdd(CLICK_STREAM_KEY, '*', message);
    }
    expect(await consumeClicks(app)).toBe(2);

    expect(await analytics()).toEqual(before);
    expect((await reloadLink()).clickCount).toBe('2');
    expect(await countRows(app, 'click_events')).toBe(2);
  });

  it('files clicks under the right country, device, operating system, and browser', async () => {
    await recordAndConsume(app, [
      clickOn(link.id, { ip: GERMAN_IP, userAgent: IPHONE_SAFARI }),
      clickOn(link.id, { ip: GERMAN_IP, userAgent: IPHONE_SAFARI }),
      clickOn(link.id, { ip: AMERICAN_IP, userAgent: WINDOWS_CHROME }),
    ]);

    expect((await analytics()).breakdowns).toMatchObject({
      country: [
        { value: 'DE', clicks: 2 },
        { value: 'US', clicks: 1 },
      ],
      device: [
        { value: 'mobile', clicks: 2 },
        { value: 'desktop', clicks: 1 },
      ],
      os: [
        { value: 'iOS', clicks: 2 },
        { value: 'Windows', clicks: 1 },
      ],
      browser: [
        { value: 'Safari', clicks: 2 },
        { value: 'Chrome', clicks: 1 },
      ],
    });
  });

  it('records an address the database does not know, or cannot look up, as ZZ', async () => {
    await recordAndConsume(app, [
      clickOn(link.id, { ip: UNLISTED_IP }),
      clickOn(link.id, { ip: '2001:db8::1' }),
      clickOn(link.id, { ip: 'not-an-address' }),
    ]);

    expect((await analytics()).breakdowns.country).toEqual([
      { value: 'ZZ', clicks: 3 },
    ]);
  });

  it('counts a QR scan apart from a click, and a referrer by its host', async () => {
    await recordAndConsume(app, [
      clickOn(link.id, { source: 'qr' }),
      clickOn(link.id, { referrer: 'https://News.Example.com/story?id=42' }),
      clickOn(link.id),
    ]);

    const { breakdowns } = await analytics();
    expect(breakdowns.source).toEqual([
      { value: 'link', clicks: 2 },
      { value: 'qr', clicks: 1 },
    ]);
    expect(breakdowns.referrer).toEqual([
      { value: '(direct)', clicks: 2 },
      { value: 'news.example.com', clicks: 1 },
    ]);
  });

  it('reports clicks per A/B variant and for the control', async () => {
    const variant = await app.get(DataSource).getRepository(LinkVariant).save({
      linkId: link.id,
      name: 'Shorter headline',
      destinationUrl: 'https://example.com/landing-b',
      weight: 30,
    });

    await recordAndConsume(app, [
      clickOn(link.id),
      clickOn(link.id),
      clickOn(link.id, { variantId: variant.id }),
    ]);

    expect((await analytics()).breakdowns.variant).toEqual([
      { value: 'control', clicks: 2 },
      { value: variant.id, clicks: 1 },
    ]);
  });

  it('stores a bot click without counting it anywhere', async () => {
    await recordAndConsume(app, [clickOn(link.id, { userAgent: GOOGLEBOT })]);

    const result = await analytics();
    expect(result.totals).toEqual({ clicks: 0, uniqueVisitors: 0 });
    expect(result.breakdowns.device).toEqual([]);
    expect((await reloadLink()).clickCount).toBe('0');
    const stored: Array<{ device_type: string }> = await app
      .get(DataSource)
      .query('SELECT "device_type" FROM "click_events"');
    expect(stored).toEqual([{ device_type: 'bot' }]);
  });

  it('leaves updated_at alone, because a click is not an edit', async () => {
    const { updatedAt } = await reloadLink();

    await recordAndConsume(app, [clickOn(link.id)]);

    expect((await reloadLink()).updatedAt).toEqual(updatedAt);
  });

  it('counts clicks of several links and days in one batch', async () => {
    const other = await insertLink(app, fixture);

    await recordAndConsume(app, [
      clickOn(link.id),
      clickOn(link.id, { clickedAt: new Date('2026-11-26T23:59:59Z') }),
      clickOn(other.id),
    ]);

    const { series } = await analytics({
      from: '2026-11-26',
      to: '2026-11-27',
    });
    expect(series.map(({ clicks }) => clicks)).toEqual([1, 1]);
    expect((await reloadLink()).clickCount).toBe('2');
    const otherLink = await app
      .get(DataSource)
      .getRepository(Link)
      .findOneByOrFail({ id: other.id });
    expect(otherLink.clickCount).toBe('1');
  });

  it('counts real redirects: N followed links are N clicks, a scan is a scan, a bot is nothing', async () => {
    const follow = (path: string, userAgent: string, ip: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Host', fixture.domain.hostname)
        .set('User-Agent', userAgent)
        .set('X-Forwarded-For', ip);

    for (let visitor = 1; visitor <= 5; visitor += 1) {
      const response = await follow(`/${link.code}`, IPHONE_SAFARI, GERMAN_IP);
      expect(response.status).toBe(302);
    }
    await follow(`/${link.code}?r=qr`, WINDOWS_CHROME, AMERICAN_IP);
    await follow(`/${link.code}`, GOOGLEBOT, AMERICAN_IP);
    await waitFor(
      async () => (await streamMessages(app)).length === 7,
      'the redirects to reach the stream',
    );
    await consumeClicks(app);

    const { totals, breakdowns } = await analytics({
      from: '2020-01-01',
      to: '2029-12-31',
    });
    expect(totals.clicks).toBe(6);
    expect(breakdowns.source).toEqual([
      { value: 'link', clicks: 5 },
      { value: 'qr', clicks: 1 },
    ]);
    expect(breakdowns.browser).toEqual([
      { value: 'Safari', clicks: 5 },
      { value: 'Chrome', clicks: 1 },
    ]);
    expect((await reloadLink()).clickCount).toBe('6');
  });

  it('survives values that need escaping', async () => {
    await recordClicks(app, [
      clickOn(link.id, { referrer: 'https://xn--bcher-kva.example/' }),
      clickOn(link.id, {
        userAgent: 'Mozilla/5.0 ({"a","b"}\\) Firefox/130.0',
      }),
    ]);

    expect(await consumeClicks(app)).toBe(2);
    expect(await countRows(app, 'click_events')).toBe(2);
  });
});
