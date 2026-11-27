import { Injectable } from '@nestjs/common';
import type { TopLink } from '@url-shortener/contracts/analytics';
import { DataSource } from 'typeorm';
import { DeviceType } from '../../database/entities/click-event.entity.js';
import type { RankedValue } from './breakdowns.js';

/** A range of UTC days, both ends included. */
export interface DayRange {
  from: string;
  to: string;
}

export interface DailyCounts {
  day: string;
  clicks: number;
  uniqueVisitors: number;
}

export interface HourlyClicks {
  hour: Date;
  clicks: number;
}

const LINK_IN_WORKSPACE = `
  SELECT 1 FROM "links" WHERE "id" = $1 AND "workspace_id" = $2`;

const LINK_DAILY = `
  SELECT "day"::text AS "day", "clicks", "unique_visitors" AS "uniqueVisitors"
  FROM "link_daily_totals"
  WHERE "link_id" = $1 AND "day" BETWEEN $2 AND $3`;

// Raw events include crawlers, which the roll-ups leave out; so does this.
const LINK_HOURLY = `
  SELECT date_trunc('hour', "clicked_at", 'UTC') AS "hour", count(*) AS "clicks"
  FROM "click_events"
  WHERE "link_id" = $1 AND "clicked_at" >= $2 AND "clicked_at" < $3
    AND "device_type" <> '${DeviceType.Bot}'
  GROUP BY 1`;

// Ranked in the database, so a link with thousands of referrers still
// returns only the rows the response needs.
const LINK_TOP_VALUES = `
  SELECT "dimension", "value", "clicks", "dimensionClicks"
  FROM (
    SELECT "dimension", "value",
      sum("clicks") AS "clicks",
      sum(sum("clicks")) OVER (PARTITION BY "dimension") AS "dimensionClicks",
      row_number() OVER (
        PARTITION BY "dimension" ORDER BY sum("clicks") DESC, "value"
      ) AS "rank"
    FROM "link_daily_breakdowns"
    WHERE "link_id" = $1 AND "day" BETWEEN $2 AND $3
    GROUP BY "dimension", "value"
  ) AS ranked
  WHERE "rank" <= $4
  ORDER BY "dimension", "rank"`;

const WORKSPACE_DAILY = `
  SELECT totals."day"::text AS "day",
    sum(totals."clicks") AS "clicks",
    sum(totals."unique_visitors") AS "uniqueVisitors"
  FROM "link_daily_totals" AS totals
  JOIN "links" ON "links"."id" = totals."link_id"
  WHERE "links"."workspace_id" = $1 AND totals."day" BETWEEN $2 AND $3
  GROUP BY totals."day"`;

const WORKSPACE_TOP_LINKS = `
  SELECT "links"."id", "links"."code", "links"."title",
    "domains"."id" AS "domainId", "domains"."hostname",
    sum(totals."clicks") AS "clicks"
  FROM "link_daily_totals" AS totals
  JOIN "links" ON "links"."id" = totals."link_id"
  JOIN "domains" ON "domains"."id" = "links"."domain_id"
  WHERE "links"."workspace_id" = $1 AND totals."day" BETWEEN $2 AND $3
  GROUP BY "links"."id", "domains"."id"
  HAVING sum(totals."clicks") > 0
  ORDER BY sum(totals."clicks") DESC, "links"."id"
  LIMIT $4`;

interface TopLinkRow {
  id: string;
  code: string;
  title: string | null;
  domainId: string;
  hostname: string;
  clicks: string;
}

/** Postgres returns 64-bit counts as strings. */
type Counted<Row, Keys extends keyof Row> = Omit<Row, Keys> &
  Record<Keys, string>;

/** Reads analytics from the roll-ups, and hourly series from raw events. */
@Injectable()
export class AnalyticsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** Scoped by workspace, so a link elsewhere looks like no link at all. */
  async linkExists(workspaceId: string, linkId: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(LINK_IN_WORKSPACE, [
      linkId,
      workspaceId,
    ]);
    return rows.length > 0;
  }

  async linkDailyCounts(
    linkId: string,
    range: DayRange,
  ): Promise<DailyCounts[]> {
    const rows: Array<Counted<DailyCounts, 'clicks' | 'uniqueVisitors'>> =
      await this.dataSource.query(LINK_DAILY, [linkId, range.from, range.to]);
    return rows.map(toDailyCounts);
  }

  /** Clicks per hour between two instants, the second excluded. */
  async linkHourlyClicks(
    linkId: string,
    from: Date,
    until: Date,
  ): Promise<HourlyClicks[]> {
    const rows: Array<Counted<HourlyClicks, 'clicks'>> =
      await this.dataSource.query(LINK_HOURLY, [linkId, from, until]);
    return rows.map(({ hour, clicks }) => ({ hour, clicks: Number(clicks) }));
  }

  async linkTopValues(
    linkId: string,
    range: DayRange,
    top: number,
  ): Promise<RankedValue[]> {
    const rows: Array<Counted<RankedValue, 'clicks' | 'dimensionClicks'>> =
      await this.dataSource.query(LINK_TOP_VALUES, [
        linkId,
        range.from,
        range.to,
        top,
      ]);
    return rows.map((row) => ({
      ...row,
      clicks: Number(row.clicks),
      dimensionClicks: Number(row.dimensionClicks),
    }));
  }

  async workspaceDailyCounts(
    workspaceId: string,
    range: DayRange,
  ): Promise<DailyCounts[]> {
    const rows: Array<Counted<DailyCounts, 'clicks' | 'uniqueVisitors'>> =
      await this.dataSource.query(WORKSPACE_DAILY, [
        workspaceId,
        range.from,
        range.to,
      ]);
    return rows.map(toDailyCounts);
  }

  async workspaceTopLinks(
    workspaceId: string,
    range: DayRange,
    limit: number,
  ): Promise<TopLink[]> {
    const rows: TopLinkRow[] = await this.dataSource.query(
      WORKSPACE_TOP_LINKS,
      [workspaceId, range.from, range.to, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      domain: { id: row.domainId, hostname: row.hostname },
      code: row.code,
      title: row.title,
      clicks: Number(row.clicks),
    }));
  }
}

function toDailyCounts(
  row: Counted<DailyCounts, 'clicks' | 'uniqueVisitors'>,
): DailyCounts {
  return {
    day: row.day,
    clicks: Number(row.clicks),
    uniqueVisitors: Number(row.uniqueVisitors),
  };
}
