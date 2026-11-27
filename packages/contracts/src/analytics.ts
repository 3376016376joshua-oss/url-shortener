import { z } from 'zod';

/** How a time series is bucketed. */
export const AnalyticsInterval = {
  Day: 'day',
  Hour: 'hour',
} as const;
export type AnalyticsInterval =
  (typeof AnalyticsInterval)[keyof typeof AnalyticsInterval];

/** The dimensions a link's clicks are broken down by, in response order. */
export const ANALYTICS_DIMENSIONS = [
  'country',
  'device',
  'os',
  'browser',
  'referrer',
  'source',
  'variant',
] as const;
export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];

/** The `referrer` value of a click that arrived without a referrer. */
export const DIRECT_REFERRER = '(direct)';
/** The `variant` value of a click served the link's own destination. */
export const CONTROL_VARIANT = 'control';
/** The breakdown value that sums everything outside the top values. */
export const OTHER_BREAKDOWN_VALUE = 'other';

/** The range used when a request names no dates: the last 30 days. */
export const DEFAULT_ANALYTICS_RANGE_DAYS = 30;
/** Bounds the size of a daily series: ten years of days. */
export const MAX_DAILY_RANGE_DAYS = 3660;
/** Hourly series come from raw events, so only for short, recent ranges. */
export const MAX_HOURLY_RANGE_DAYS = 7;
/** How long raw events are kept, and so how far back hourly series reach. */
export const RAW_EVENT_RETENTION_DAYS = 90;
export const DEFAULT_BREAKDOWN_TOP = 10;
export const MAX_BREAKDOWN_TOP = 50;
/** How many links the workspace overview ranks. */
export const WORKSPACE_TOP_LINKS = 10;

/** A UTC calendar day, `YYYY-MM-DD`. */
const utcDay = z.iso.date();

const dateRange = {
  /** First day of the range, inclusive. Defaults to 30 days ending at `to`. */
  from: utcDay.optional(),
  /** Last day of the range, inclusive. Defaults to today (UTC). */
  to: utcDay.optional(),
};

export const linkAnalyticsParamsSchema = z.object({
  workspaceId: z.uuid(),
  linkId: z.uuid(),
});
export type LinkAnalyticsParams = z.infer<typeof linkAnalyticsParamsSchema>;

export const linkAnalyticsQuerySchema = z.strictObject({
  ...dateRange,
  interval: z.enum(AnalyticsInterval).default(AnalyticsInterval.Day),
  /** How many values each breakdown lists before summing the rest as "other". */
  top: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_BREAKDOWN_TOP)
    .default(DEFAULT_BREAKDOWN_TOP),
});
export type LinkAnalyticsQuery = z.infer<typeof linkAnalyticsQuerySchema>;

export const workspaceAnalyticsParamsSchema = z.object({
  workspaceId: z.uuid(),
});
export type WorkspaceAnalyticsParams = z.infer<
  typeof workspaceAnalyticsParamsSchema
>;

export const workspaceAnalyticsQuerySchema = z.strictObject(dateRange);
export type WorkspaceAnalyticsQuery = z.infer<
  typeof workspaceAnalyticsQuerySchema
>;

const count = z.number().int().nonnegative();

export const analyticsRangeSchema = z.object({
  from: utcDay,
  to: utcDay,
  interval: z.enum(AnalyticsInterval),
});
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;

/**
 * Unique visitors are an estimate: exact to about 1% within a day, and summed
 * across days, so a visitor who returns on another day counts again.
 */
export const analyticsTotalsSchema = z.object({
  clicks: count,
  uniqueVisitors: count,
});
export type AnalyticsTotals = z.infer<typeof analyticsTotalsSchema>;

export const analyticsSeriesPointSchema = z.object({
  /** A UTC day (`2026-11-26`) or, for hourly series, the start of the hour. */
  bucket: z.string(),
  clicks: count,
  /** Present for daily series only. */
  uniqueVisitors: count.optional(),
});
export type AnalyticsSeriesPoint = z.infer<typeof analyticsSeriesPointSchema>;

export const breakdownEntrySchema = z.object({
  value: z.string(),
  clicks: count,
});
export type BreakdownEntry = z.infer<typeof breakdownEntrySchema>;

const breakdown = z.array(breakdownEntrySchema);

export const linkAnalyticsSchema = z.object({
  range: analyticsRangeSchema,
  totals: analyticsTotalsSchema,
  series: z.array(analyticsSeriesPointSchema),
  breakdowns: z.object({
    country: breakdown,
    device: breakdown,
    os: breakdown,
    browser: breakdown,
    referrer: breakdown,
    source: breakdown,
    variant: breakdown,
  }),
});
export type LinkAnalytics = z.infer<typeof linkAnalyticsSchema>;

export const topLinkSchema = z.object({
  id: z.uuid(),
  domain: z.object({ id: z.uuid(), hostname: z.string() }),
  code: z.string(),
  title: z.string().nullable(),
  clicks: count,
});
export type TopLink = z.infer<typeof topLinkSchema>;

export const workspaceAnalyticsSchema = z.object({
  range: analyticsRangeSchema,
  totals: analyticsTotalsSchema,
  series: z.array(analyticsSeriesPointSchema),
  topLinks: z.array(topLinkSchema),
});
export type WorkspaceAnalytics = z.infer<typeof workspaceAnalyticsSchema>;
