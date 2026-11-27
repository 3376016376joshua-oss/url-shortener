import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis-client.js';
import { visitorSketchKey } from '../redis-keys.js';
import type { ReducedClick } from '../reduced-click.js';
import { utcDay } from '../utc-day.js';
import { buildRollups, isCountable, type Rollups } from './click-rollup.js';

/** What became of a batch of clicks. */
export interface BatchOutcome {
  /** Stored for the first time. */
  persisted: number;
  /** Already stored by an earlier delivery; changed nothing. */
  duplicates: number;
  /** Clicks of links that no longer exist. */
  discarded: number;
}

interface SketchSize {
  linkId: string;
  day: string;
  visitors: number;
}

// Locking the links, in id order, does three jobs: a link cannot be deleted
// under the roll-ups that reference it, two consumers writing the same links
// queue instead of deadlocking, and the rows returned are the links that
// still exist.
const LOCK_LINKS = `
  SELECT "id" FROM "links" WHERE "id" = ANY($1::uuid[])
  ORDER BY "id" FOR NO KEY UPDATE`;

const INSERT_EVENTS = `
  INSERT INTO "click_events"
    ("event_id", "clicked_at", "link_id", "variant_id", "source", "country",
     "device_type", "os", "browser", "referrer_host")
  SELECT * FROM unnest(
    $1::uuid[], $2::timestamptz[], $3::uuid[], $4::uuid[], $5::text[],
    $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
  ON CONFLICT DO NOTHING
  RETURNING "event_id" AS "eventId"`;

const ADD_DAILY_TOTALS = `
  INSERT INTO "link_daily_totals" ("link_id", "day", "clicks")
  SELECT * FROM unnest($1::uuid[], $2::date[], $3::bigint[])
  ON CONFLICT ("link_id", "day") DO UPDATE
    SET "clicks" = "link_daily_totals"."clicks" + EXCLUDED."clicks"`;

const ADD_DAILY_BREAKDOWNS = `
  INSERT INTO "link_daily_breakdowns"
    ("link_id", "day", "dimension", "value", "clicks")
  SELECT * FROM unnest(
    $1::uuid[], $2::date[], $3::text[], $4::text[], $5::bigint[])
  ON CONFLICT ("link_id", "day", "dimension", "value") DO UPDATE
    SET "clicks" = "link_daily_breakdowns"."clicks" + EXCLUDED."clicks"`;

// Raw SQL on purpose: the ORM's update helpers would also set "updated_at",
// which must change only when someone edits the link.
const ADD_LINK_CLICKS = `
  UPDATE "links" SET "click_count" = "links"."click_count" + batch."clicks"
  FROM unnest($1::uuid[], $2::bigint[]) AS batch("link_id", "clicks")
  WHERE "links"."id" = batch."link_id"`;

// GREATEST, not assignment: a sketch that was lost or has expired must never
// lower a count that was already reported.
const RAISE_UNIQUE_VISITORS = `
  UPDATE "link_daily_totals" AS totals
  SET "unique_visitors" = GREATEST(totals."unique_visitors", batch."visitors")
  FROM unnest($1::uuid[], $2::date[], $3::bigint[])
    AS batch("link_id", "day", "visitors")
  WHERE totals."link_id" = batch."link_id" AND totals."day" = batch."day"`;

const column = <Row, Key extends keyof Row>(
  rows: readonly Row[],
  key: Key,
): Array<Row[Key]> => rows.map((row) => row[key]);

function withoutRepeats(clicks: readonly ReducedClick[]): ReducedClick[] {
  return [...new Map(clicks.map((click) => [click.eventId, click])).values()];
}

/**
 * Writes one batch of clicks in one transaction: the raw events, and for the
 * events that were actually new, the roll-ups and each link's click count.
 * Delivery is at-least-once; `event_id` makes the effect exactly-once, so
 * writing the same batch again changes nothing.
 */
@Injectable()
export class ClickBatchWriter {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async write(batch: readonly ReducedClick[]): Promise<BatchOutcome> {
    const clicks = withoutRepeats(batch);
    if (clicks.length === 0) {
      return { persisted: 0, duplicates: 0, discarded: 0 };
    }
    // Read before the transaction, so it is never held open across Redis.
    // Redelivered clicks are included: their sketches may have grown.
    const sketches = await this.readSketchSizes(clicks.filter(isCountable));

    return this.dataSource.transaction(async (manager) => {
      const existing = await lockExistingLinks(manager, clicks);
      const accepted = clicks.filter(({ linkId }) => existing.has(linkId));
      const inserted = await insertEvents(manager, accepted);
      await addRollups(
        manager,
        buildRollups(accepted.filter(({ eventId }) => inserted.has(eventId))),
      );
      await raiseUniqueVisitors(
        manager,
        sketches.filter(({ linkId }) => existing.has(linkId)),
      );
      return {
        persisted: inserted.size,
        duplicates: accepted.length - inserted.size,
        discarded: clicks.length - accepted.length,
      };
    });
  }

  private async readSketchSizes(
    clicks: readonly ReducedClick[],
  ): Promise<SketchSize[]> {
    const affected = new Map<string, { linkId: string; day: string }>();
    for (const { linkId, clickedAt } of clicks) {
      const day = utcDay(clickedAt);
      affected.set(visitorSketchKey(linkId, day), { linkId, day });
    }
    // The client pipelines commands issued in the same tick: one round trip.
    return Promise.all(
      [...affected].map(async ([key, sketch]) => ({
        ...sketch,
        visitors: await this.redis.pfCount(key),
      })),
    );
  }
}

async function lockExistingLinks(
  manager: EntityManager,
  clicks: readonly ReducedClick[],
): Promise<Set<string>> {
  const linkIds = [...new Set(column(clicks, 'linkId'))];
  const rows: Array<{ id: string }> = await manager.query(LOCK_LINKS, [
    linkIds,
  ]);
  return new Set(column(rows, 'id'));
}

async function insertEvents(
  manager: EntityManager,
  clicks: readonly ReducedClick[],
): Promise<Set<string>> {
  const rows: Array<{ eventId: string }> = await manager.query(INSERT_EVENTS, [
    column(clicks, 'eventId'),
    clicks.map(({ clickedAt }) => clickedAt.toISOString()),
    column(clicks, 'linkId'),
    column(clicks, 'variantId'),
    column(clicks, 'source'),
    column(clicks, 'country'),
    column(clicks, 'deviceType'),
    column(clicks, 'os'),
    column(clicks, 'browser'),
    column(clicks, 'referrerHost'),
  ]);
  return new Set(column(rows, 'eventId'));
}

async function addRollups(
  manager: EntityManager,
  { totals, breakdowns, links }: Rollups,
): Promise<void> {
  if (links.length === 0) {
    return;
  }
  await manager.query(ADD_DAILY_TOTALS, [
    column(totals, 'linkId'),
    column(totals, 'day'),
    column(totals, 'clicks'),
  ]);
  await manager.query(ADD_DAILY_BREAKDOWNS, [
    column(breakdowns, 'linkId'),
    column(breakdowns, 'day'),
    column(breakdowns, 'dimension'),
    column(breakdowns, 'value'),
    column(breakdowns, 'clicks'),
  ]);
  await manager.query(ADD_LINK_CLICKS, [
    column(links, 'linkId'),
    column(links, 'clicks'),
  ]);
}

async function raiseUniqueVisitors(
  manager: EntityManager,
  sketches: readonly SketchSize[],
): Promise<void> {
  if (sketches.length === 0) {
    return;
  }
  await manager.query(RAISE_UNIQUE_VISITORS, [
    column(sketches, 'linkId'),
    column(sketches, 'day'),
    column(sketches, 'visitors'),
  ]);
}
