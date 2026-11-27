import type {
  AnalyticsSeriesPoint,
  AnalyticsTotals,
} from '@url-shortener/contracts/analytics';
import { addDays, eachDay, startOfUtcDay } from '../utc-day.js';
import type {
  DailyCounts,
  DayRange,
  HourlyClicks,
} from './analytics.repository.js';

const MS_PER_HOUR = 3_600_000;

/** The instants an hourly query covers: the first included, the second not. */
export function hourlyWindow(range: DayRange): { from: Date; until: Date } {
  return {
    from: startOfUtcDay(range.from),
    until: startOfUtcDay(addDays(range.to, 1)),
  };
}

export function sumTotals(counts: readonly DailyCounts[]): AnalyticsTotals {
  return counts.reduce(
    (totals, { clicks, uniqueVisitors }) => ({
      clicks: totals.clicks + clicks,
      uniqueVisitors: totals.uniqueVisitors + uniqueVisitors,
    }),
    { clicks: 0, uniqueVisitors: 0 },
  );
}

/** One point per day of the range, with zeros for days without clicks. */
export function dailySeries(
  range: DayRange,
  counts: readonly DailyCounts[],
): AnalyticsSeriesPoint[] {
  const byDay = new Map(counts.map((row) => [row.day, row]));
  return eachDay(range.from, range.to).map((day) => ({
    bucket: day,
    clicks: byDay.get(day)?.clicks ?? 0,
    uniqueVisitors: byDay.get(day)?.uniqueVisitors ?? 0,
  }));
}

/**
 * One point per hour of the range, with zeros for hours without clicks.
 * No unique visitors: they are estimated per day, not per hour.
 */
export function hourlySeries(
  range: DayRange,
  counts: readonly HourlyClicks[],
): AnalyticsSeriesPoint[] {
  const { from, until } = hourlyWindow(range);
  const byHour = new Map(
    counts.map(({ hour, clicks }) => [hour.getTime(), clicks]),
  );
  const hours = (until.getTime() - from.getTime()) / MS_PER_HOUR;
  return Array.from({ length: hours }, (_unused, index) => {
    const hour = from.getTime() + index * MS_PER_HOUR;
    return {
      bucket: new Date(hour).toISOString(),
      clicks: byHour.get(hour) ?? 0,
    };
  });
}
