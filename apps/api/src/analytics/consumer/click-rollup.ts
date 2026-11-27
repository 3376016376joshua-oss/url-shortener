import {
  CONTROL_VARIANT,
  DIRECT_REFERRER,
  type AnalyticsDimension,
} from '@url-shortener/contracts/analytics';
import { DeviceType } from '../../database/entities/click-event.entity.js';
import type { ReducedClick } from '../reduced-click.js';
import { utcDay } from '../utc-day.js';

export interface DailyTotalIncrement {
  linkId: string;
  day: string;
  clicks: number;
}

export interface BreakdownIncrement extends DailyTotalIncrement {
  dimension: AnalyticsDimension;
  value: string;
}

export interface LinkIncrement {
  linkId: string;
  clicks: number;
}

/** What a batch of clicks adds to the roll-up tables. */
export interface Rollups {
  totals: DailyTotalIncrement[];
  breakdowns: BreakdownIncrement[];
  links: LinkIncrement[];
}

/** A crawler or preview fetcher: stored, but left out of every count. */
export function isCountable(click: ReducedClick): boolean {
  return click.deviceType !== DeviceType.Bot;
}

function dimensionValues(
  click: ReducedClick,
): Array<[AnalyticsDimension, string]> {
  return [
    ['country', click.country],
    ['device', click.deviceType],
    ['os', click.os],
    ['browser', click.browser],
    ['referrer', click.referrerHost ?? DIRECT_REFERRER],
    ['source', click.source],
    ['variant', click.variantId ?? CONTROL_VARIANT],
  ];
}

/** Counts into `counters` under a key, keeping the first row seen for it. */
function increment<Row extends { clicks: number }>(
  counters: Map<string, Row>,
  key: string,
  row: Omit<Row, 'clicks'>,
): void {
  const counter = counters.get(key) ?? ({ ...row, clicks: 0 } as Row);
  counter.clicks += 1;
  counters.set(key, counter);
}

/**
 * Rows in key order. Every batch then touches rows in the same order, so two
 * consumers writing overlapping roll-ups cannot deadlock each other.
 */
function inKeyOrder<Row>(counters: Map<string, Row>): Row[] {
  return [...counters.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([, row]) => row);
}

/**
 * Aggregates clicks into roll-up increments. Pure. Pass only clicks that were
 * newly stored, so a redelivered click is never counted twice.
 */
export function buildRollups(clicks: readonly ReducedClick[]): Rollups {
  const totals = new Map<string, DailyTotalIncrement>();
  const breakdowns = new Map<string, BreakdownIncrement>();
  const links = new Map<string, LinkIncrement>();

  for (const click of clicks.filter(isCountable)) {
    const { linkId } = click;
    const day = utcDay(click.clickedAt);
    increment(links, linkId, { linkId });
    increment(totals, `${linkId} ${day}`, { linkId, day });
    for (const [dimension, value] of dimensionValues(click)) {
      // Values never contain a newline, so the key cannot be ambiguous.
      const key = `${linkId} ${day} ${dimension}\n${value}`;
      increment(breakdowns, key, { linkId, day, dimension, value });
    }
  }

  return {
    totals: inKeyOrder(totals),
    breakdowns: inKeyOrder(breakdowns),
    links: inKeyOrder(links),
  };
}
