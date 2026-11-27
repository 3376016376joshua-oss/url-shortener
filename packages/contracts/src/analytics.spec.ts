import { describe, expect, it } from 'vitest';
import {
  linkAnalyticsQuerySchema,
  linkAnalyticsSchema,
  workspaceAnalyticsQuerySchema,
  workspaceAnalyticsSchema,
} from './analytics.js';

/** The link analytics example of PRD section 14. */
const LINK_ANALYTICS = {
  range: { from: '2026-11-01', to: '2026-11-27', interval: 'day' },
  totals: { clicks: 1284, uniqueVisitors: 911 },
  series: [{ bucket: '2026-11-26', clicks: 310, uniqueVisitors: 240 }],
  breakdowns: {
    country: [
      { value: 'DE', clicks: 512 },
      { value: 'other', clicks: 97 },
    ],
    device: [{ value: 'mobile', clicks: 801 }],
    os: [{ value: 'iOS', clicks: 640 }],
    browser: [{ value: 'Safari', clicks: 598 }],
    referrer: [{ value: '(direct)', clicks: 640 }],
    source: [
      { value: 'link', clicks: 1100 },
      { value: 'qr', clicks: 184 },
    ],
    variant: [
      { value: 'control', clicks: 900 },
      { value: '0193d2a1-0000-7d44-a1b2-c3d4e5f60718', clicks: 384 },
    ],
  },
};

describe('linkAnalyticsQuerySchema', () => {
  it('defaults to a daily series and the top 10 values', () => {
    expect(linkAnalyticsQuerySchema.parse({})).toEqual({
      interval: 'day',
      top: 10,
    });
  });

  it('reads the numbers of a query string', () => {
    const query = { from: '2026-11-01', to: '2026-11-27', top: '25' };

    expect(linkAnalyticsQuerySchema.parse(query)).toEqual({
      ...query,
      interval: 'day',
      top: 25,
    });
  });

  it.each([
    ['a day that does not exist', { from: '2026-02-30' }],
    ['a timestamp instead of a day', { to: '2026-11-27T08:00:00Z' }],
    ['an unknown interval', { interval: 'week' }],
    ['a top below 1', { top: '0' }],
    ['a top above 50', { top: '51' }],
    ['a fractional top', { top: '2.5' }],
    ['an unknown property', { country: 'DE' }],
  ])('rejects %s', (_reason, query) => {
    expect(linkAnalyticsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('workspaceAnalyticsQuerySchema', () => {
  it('takes a range and nothing else', () => {
    const range = { from: '2026-11-01', to: '2026-11-27' };

    expect(workspaceAnalyticsQuerySchema.parse(range)).toEqual(range);
    expect(
      workspaceAnalyticsQuerySchema.safeParse({ ...range, top: '5' }).success,
    ).toBe(false);
  });
});

describe('analytics responses', () => {
  it('accepts the documented link analytics', () => {
    expect(linkAnalyticsSchema.parse(LINK_ANALYTICS)).toEqual(LINK_ANALYTICS);
  });

  it('accepts an hourly series, which has no unique visitors', () => {
    const hourly = {
      ...LINK_ANALYTICS,
      range: { ...LINK_ANALYTICS.range, interval: 'hour' },
      series: [{ bucket: '2026-11-26T13:00:00.000Z', clicks: 12 }],
    };

    expect(linkAnalyticsSchema.parse(hourly)).toEqual(hourly);
  });

  it('rejects link analytics that lack a dimension', () => {
    const result = linkAnalyticsSchema.safeParse({
      ...LINK_ANALYTICS,
      breakdowns: { ...LINK_ANALYTICS.breakdowns, variant: undefined },
    });

    expect(result.success).toBe(false);
  });

  it('accepts a workspace overview', () => {
    const overview = {
      range: LINK_ANALYTICS.range,
      totals: LINK_ANALYTICS.totals,
      series: LINK_ANALYTICS.series,
      topLinks: [
        {
          id: '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e',
          domain: {
            id: '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a',
            hostname: 'go.brand.com',
          },
          code: 'launch',
          title: null,
          clicks: 1284,
        },
      ],
    };

    expect(workspaceAnalyticsSchema.parse(overview)).toEqual(overview);
  });
});
