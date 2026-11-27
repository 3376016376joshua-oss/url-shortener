import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import {
  AnalyticsInterval,
  DEFAULT_ANALYTICS_RANGE_DAYS,
  MAX_DAILY_RANGE_DAYS,
  MAX_HOURLY_RANGE_DAYS,
  RAW_EVENT_RETENTION_DAYS,
  type AnalyticsRange,
} from '@url-shortener/contracts/analytics';
import { ApiException } from '../../common/errors/api-exception.js';
import { addDays, daysInRange, utcDay } from '../utc-day.js';

export interface RangeRequest {
  from?: string | undefined;
  to?: string | undefined;
  interval?: AnalyticsInterval | undefined;
}

const invalidRange = (message: string): ApiException =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ValidationFailed, message);

/**
 * Turns the dates of a request into the range to report on, or refuses it.
 * Days are UTC and both ends are included. Without dates the range is the
 * last 30 days. Hourly series are read from raw events, so they are limited
 * to 7 days within the retention window.
 */
export function resolveRange(request: RangeRequest, now: Date): AnalyticsRange {
  const today = utcDay(now);
  const to = request.to ?? today;
  const from = request.from ?? addDays(to, 1 - DEFAULT_ANALYTICS_RANGE_DAYS);
  const interval = request.interval ?? AnalyticsInterval.Day;
  const days = daysInRange(from, to);

  if (days < 1) {
    throw invalidRange('from: must not be after to');
  }
  if (interval === AnalyticsInterval.Day && days > MAX_DAILY_RANGE_DAYS) {
    throw invalidRange(
      `from: the range may span at most ${MAX_DAILY_RANGE_DAYS} days`,
    );
  }
  if (interval === AnalyticsInterval.Hour) {
    if (days > MAX_HOURLY_RANGE_DAYS) {
      throw invalidRange(
        `interval: hourly series are available for at most ${MAX_HOURLY_RANGE_DAYS} days`,
      );
    }
    if (from < addDays(today, -RAW_EVENT_RETENTION_DAYS)) {
      throw invalidRange(
        `interval: hourly series are available for the last ${RAW_EVENT_RETENTION_DAYS} days only`,
      );
    }
  }
  return { from, to, interval };
}
