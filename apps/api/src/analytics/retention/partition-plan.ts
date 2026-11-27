import { RAW_EVENT_RETENTION_DAYS } from '@url-shortener/contracts/analytics';
import { addDays, utcDay } from '../utc-day.js';

/** Partitions are prepared this many days ahead, so a missed run is harmless. */
export const PARTITIONS_AHEAD_DAYS = 7;

const PARTITION_PREFIX = 'click_events_p';
const PARTITION_NAME = /^click_events_p(\d{4})(\d{2})(\d{2})$/;

/** The table that holds one UTC day of clicks, for example `click_events_p20261127`. */
export function partitionName(day: string): string {
  return `${PARTITION_PREFIX}${day.replaceAll('-', '')}`;
}

/** The day a partition holds, or `null` for a table that is not a daily partition. */
export function partitionDay(name: string): string | null {
  const match = PARTITION_NAME.exec(name);
  return match === null ? null : `${match[1]}-${match[2]}-${match[3]}`;
}

export interface PartitionPlan {
  /** Days that need a partition and have none, oldest first. */
  create: string[];
  /** Days whose partitions have left the retention window, oldest first. */
  drop: string[];
  /** The first day still kept. Anything before it is removed. */
  keepFrom: string;
}

/**
 * Decides what the daily maintenance does. Pure. A partition is wanted for
 * today, each of the next days, and any kept day that has clicks waiting in
 * the default partition; one is dropped once its whole day is older than the
 * retention window.
 */
export function planPartitions(input: {
  now: Date;
  existingDays: readonly string[];
  daysWaitingInDefault: readonly string[];
}): PartitionPlan {
  const today = utcDay(input.now);
  const keepFrom = addDays(today, -RAW_EVENT_RETENTION_DAYS);
  const existing = new Set(input.existingDays);

  const upcoming = Array.from(
    { length: PARTITIONS_AHEAD_DAYS + 1 },
    (_, ahead) => addDays(today, ahead),
  );
  const wanted = new Set([
    ...upcoming,
    ...input.daysWaitingInDefault.filter((day) => day >= keepFrom),
  ]);

  return {
    create: [...wanted].filter((day) => !existing.has(day)).sort(),
    drop: input.existingDays.filter((day) => day < keepFrom).sort(),
    keepFrom,
  };
}
