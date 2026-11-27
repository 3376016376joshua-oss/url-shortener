import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ClickPartitions } from '../../src/analytics/retention/click-partitions.js';
import type { Link } from '../../src/database/entities/link.entity.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  clickOn,
  clockAt,
  countRows,
  insertLink,
  recordAndConsume,
} from './support.js';

const MS_PER_DAY = 86_400_000;

/**
 * Partitions outlive a test (resetting state empties tables, it does not drop
 * them), so every test works in a year of its own.
 */
const noonOn = (day: string): Date => new Date(`${day}T12:00:00Z`);
const daysBefore = (instant: Date, days: number): Date =>
  new Date(instant.getTime() - days * MS_PER_DAY);

describe('click partitions and retention', () => {
  let app: NestExpressApplication;
  let partitions: ClickPartitions;
  let fixture: WorkspaceFixture;
  let link: Link;
  let now: Date;

  const partitionNames = async (year: string): Promise<string[]> => {
    const rows: Array<{ name: string }> = await app.get(DataSource).query(
      `SELECT child.relname AS "name" FROM pg_inherits
         JOIN pg_class child ON child.oid = pg_inherits.inhrelid
         WHERE pg_inherits.inhparent = 'click_events'::regclass
           AND child.relname LIKE $1
         ORDER BY 1`,
      [`click_events_p${year}%`],
    );
    return rows.map(({ name }) => name);
  };

  /** Which table each stored click physically lives in. */
  const clickLocations = async (): Promise<string[]> => {
    const rows: Array<{ location: string }> = await app
      .get(DataSource)
      .query(
        `SELECT tableoid::regclass::text AS "location" FROM "click_events" ORDER BY "clicked_at"`,
      );
    return rows.map(({ location }) => location);
  };

  beforeAll(async () => {
    app = await createTestApp(clockAt(() => now));
    partitions = app.get(ClickPartitions);
  });

  beforeEach(async () => {
    await resetState(app);
    fixture = await createWorkspaceFixture(app);
    link = await insertLink(app, fixture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('prepares a partition for today and each of the next 7 days', async () => {
    now = noonOn('2031-12-28');

    await partitions.maintain();

    expect(await partitionNames('203')).toEqual([
      'click_events_p20311228',
      'click_events_p20311229',
      'click_events_p20311230',
      'click_events_p20311231',
      'click_events_p20320101',
      'click_events_p20320102',
      'click_events_p20320103',
      'click_events_p20320104',
    ]);
  });

  it('can run again without changing anything', async () => {
    now = noonOn('2033-03-01');
    await partitions.maintain();
    const before = await partitionNames('2033');

    await partitions.maintain();

    expect(await partitionNames('2033')).toEqual(before);
  });

  it("stores a click in its day's partition, by UTC day", async () => {
    now = noonOn('2034-05-10');
    await partitions.maintain();

    await recordAndConsume(app, [
      clickOn(link.id, { clickedAt: new Date('2034-05-10T23:59:59.999Z') }),
      clickOn(link.id, { clickedAt: new Date('2034-05-11T00:00:00.000Z') }),
    ]);

    expect(await clickLocations()).toEqual([
      'click_events_p20340510',
      'click_events_p20340511',
    ]);
  });

  it('removes events older than 90 days and keeps their roll-ups', async () => {
    now = noonOn('2035-06-30');
    const kept = daysBefore(now, 90);
    const expired = daysBefore(now, 91);
    // Each click was recorded on its own day, when that day had a partition.
    for (const clickedAt of [expired, kept]) {
      now = clickedAt;
      await partitions.maintain();
      await recordAndConsume(app, [clickOn(link.id, { clickedAt })]);
    }
    expect(await countRows(app, 'click_events')).toBe(2);

    now = noonOn('2035-06-30');
    await partitions.maintain();

    const remaining: Array<{ clicked_at: Date }> = await app
      .get(DataSource)
      .query('SELECT "clicked_at" FROM "click_events"');
    expect(remaining).toEqual([{ clicked_at: kept }]);
    expect(await partitionNames('20350331')).toEqual([]);
    expect(await partitionNames('20350401')).toEqual([
      'click_events_p20350401',
    ]);
    const totals: Array<{ clicks: string }> = await app
      .get(DataSource)
      .query('SELECT sum("clicks") AS "clicks" FROM "link_daily_totals"');
    expect(totals).toEqual([{ clicks: '2' }]);
    expect(await countRows(app, 'link_daily_breakdowns')).toBe(14);
  });

  it('catches a click for an unprepared day in the default partition, then moves it', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const clickedAt = noonOn('2036-02-03');
    await recordAndConsume(app, [clickOn(link.id, { clickedAt })]);
    expect(await clickLocations()).toEqual(['click_events_default']);

    // Maintenance resumes days later, with that day still inside retention.
    now = noonOn('2036-02-20');
    await partitions.maintain();

    expect(await clickLocations()).toEqual(['click_events_p20360203']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('click_events_default is not empty'),
    );
    // And the day now takes new clicks directly.
    await recordAndConsume(app, [clickOn(link.id, { clickedAt })]);
    expect(await clickLocations()).toEqual([
      'click_events_p20360203',
      'click_events_p20360203',
    ]);
  });

  it('removes a click past retention from the default partition too', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await recordAndConsume(app, [
      clickOn(link.id, { clickedAt: noonOn('2037-01-01') }),
    ]);
    expect(await clickLocations()).toEqual(['click_events_default']);

    now = noonOn('2037-06-01');
    await partitions.maintain();

    expect(await countRows(app, 'click_events')).toBe(0);
    expect(await partitionNames('20370101')).toEqual([]);
  });

  it('keeps the migrated schema and the entities in agreement', async () => {
    now = noonOn('2038-01-01');
    await partitions.maintain();

    const drift = await app.get(DataSource).driver.createSchemaBuilder().log();

    expect(drift.upQueries.map(({ query }) => query)).toEqual([]);
  });
});
