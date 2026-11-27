import {
  ANALYTICS_DIMENSIONS,
  OTHER_BREAKDOWN_VALUE,
  type AnalyticsDimension,
  type BreakdownEntry,
  type LinkAnalytics,
} from '@url-shortener/contracts/analytics';

/** One of a dimension's top values, with the clicks of the whole dimension. */
export interface RankedValue {
  dimension: AnalyticsDimension;
  value: string;
  clicks: number;
  /** Clicks across every value of the dimension, listed or not. */
  dimensionClicks: number;
}

/**
 * The top values of one dimension, then everything else summed as "other".
 * A real value can itself be called "other" (a device type is), in which
 * case the remainder joins it rather than appearing twice.
 */
function withRemainder(ranked: readonly RankedValue[]): BreakdownEntry[] {
  const entries = ranked.map(({ value, clicks }) => ({ value, clicks }));
  const listed = entries.reduce((sum, { clicks }) => sum + clicks, 0);
  const remainder = (ranked[0]?.dimensionClicks ?? 0) - listed;
  if (remainder <= 0) {
    return entries;
  }
  const namesake = entries.find(({ value }) => value === OTHER_BREAKDOWN_VALUE);
  if (namesake === undefined) {
    return [...entries, { value: OTHER_BREAKDOWN_VALUE, clicks: remainder }];
  }
  namesake.clicks += remainder;
  return entries;
}

/** Groups ranked values into one breakdown per dimension. Pure. */
export function toBreakdowns(
  ranked: readonly RankedValue[],
): LinkAnalytics['breakdowns'] {
  const breakdown = (dimension: AnalyticsDimension): BreakdownEntry[] =>
    withRemainder(ranked.filter((row) => row.dimension === dimension));
  return Object.fromEntries(
    ANALYTICS_DIMENSIONS.map((dimension) => [dimension, breakdown(dimension)]),
  ) as LinkAnalytics['breakdowns'];
}
