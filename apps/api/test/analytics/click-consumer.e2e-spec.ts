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
  type MockInstance,
} from 'vitest';
import { ClickBatchWriter } from '../../src/analytics/consumer/click-batch-writer.js';
import { ClickConsumer } from '../../src/analytics/consumer/click-consumer.js';
import {
  CLICK_CONSUMER_GROUP,
  CLICK_STREAM_KEY,
} from '../../src/analytics/redis-keys.js';
import { Metrics } from '../../src/common/metrics/metrics.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  GOOGLEBOT,
  clickOn,
  consumeClicks,
  countRows,
  insertLink,
  recordClicks,
  redisOf,
  streamMessages,
} from './support.js';

describe('click consumer', () => {
  let app: NestExpressApplication;
  let consumer: ClickConsumer;
  let fixture: WorkspaceFixture;
  let link: Link;
  let counted: MockInstance<Metrics['incrementCounter']>;

  const pendingEntries = async (): Promise<number> => {
    const summary = await redisOf(app).xPending(
      CLICK_STREAM_KEY,
      CLICK_CONSUMER_GROUP,
    );
    return summary.pending;
  };

  const clickCount = async (): Promise<string> => {
    const stored = await app
      .get(DataSource)
      .getRepository(Link)
      .findOneByOrFail({ id: link.id });
    return stored.clickCount;
  };

  const countedResults = (): string[] =>
    counted.mock.calls
      .filter(([name]) => name === 'click_events_total')
      .map(([, labels]) => labels?.result ?? '');

  beforeAll(async () => {
    app = await createTestApp();
    consumer = app.get(ClickConsumer);
  });

  beforeEach(async () => {
    await resetState(app);
    fixture = await createWorkspaceFixture(app);
    link = await insertLink(app, fixture);
    counted = vi.spyOn(app.get(Metrics), 'incrementCounter');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('acknowledges what it has stored, leaving nothing pending', async () => {
    await recordClicks(app, [clickOn(link.id), clickOn(link.id)]);

    expect(await consumeClicks(app)).toBe(2);

    expect(await pendingEntries()).toBe(0);
    expect(await consumer.consumeOnce()).toBe(0);
  });

  it('processes clicks that were queued before any consumer existed', async () => {
    await recordClicks(app, [clickOn(link.id)]);
    expect(await redisOf(app).exists(CLICK_STREAM_KEY)).toBe(1);

    await consumeClicks(app);

    expect(await clickCount()).toBe('1');
  });

  it('creates its group again after Redis loses the stream', async () => {
    await recordClicks(app, [clickOn(link.id)]);
    await consumeClicks(app);
    await redisOf(app).flushDb();

    await recordClicks(app, [clickOn(link.id)]);
    await consumeClicks(app);

    expect(await clickCount()).toBe('2');
  });

  it('acknowledges and discards clicks of a link that no longer exists', async () => {
    await recordClicks(app, [clickOn(link.id)]);
    await app.get(DataSource).getRepository(Link).delete({ id: link.id });

    expect(await consumeClicks(app)).toBe(1);

    expect(await countRows(app, 'click_events')).toBe(0);
    expect(await countRows(app, 'link_daily_totals')).toBe(0);
    expect(await pendingEntries()).toBe(0);
    expect(countedResults()).toContain('dropped');
  });

  it('acknowledges and discards an entry that is not a click', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await recordClicks(app, [clickOn(link.id)]);
    await redisOf(app).xAdd(CLICK_STREAM_KEY, '*', { linkId: 'garbage' });

    expect(await consumeClicks(app)).toBe(2);

    expect(await clickCount()).toBe('1');
    expect(await pendingEntries()).toBe(0);
  });

  it('leaves entries delivered to another consumer alone until they are stale', async () => {
    await recordClicks(app, [clickOn(link.id), clickOn(link.id)]);
    await consumeClicks(app);
    await recordClicks(app, [clickOn(link.id), clickOn(link.id)]);
    // A consumer that reads a batch and crashes before acknowledging it.
    await redisOf(app).xReadGroup(CLICK_CONSUMER_GROUP, 'crashed-consumer', {
      key: CLICK_STREAM_KEY,
      id: '>',
    });

    expect(await consumer.consumeOnce()).toBe(0);
    expect(await clickCount()).toBe('2');

    expect(await consumer.consumeOnce({ staleAfterMs: 0 })).toBe(2);
    expect(await clickCount()).toBe('4');
    expect(await pendingEntries()).toBe(0);
  });

  it('retries a batch it could not write, and counts it once', async () => {
    await recordClicks(app, [clickOn(link.id), clickOn(link.id)]);
    vi.spyOn(app.get(ClickBatchWriter), 'write').mockRejectedValueOnce(
      new Error('database is down'),
    );

    await expect(consumer.consumeOnce()).rejects.toThrow('database is down');
    expect(await pendingEntries()).toBe(2);
    expect(await clickCount()).toBe('0');

    expect(await consumer.consumeOnce()).toBe(2);
    expect(await clickCount()).toBe('2');
    expect(await pendingEntries()).toBe(0);
  });

  it('stores nothing of a batch whose transaction fails part-way', async () => {
    await recordClicks(app, [clickOn(link.id)]);
    const dataSource = app.get(DataSource);
    await dataSource.query(
      `ALTER TABLE "link_daily_breakdowns" ADD CONSTRAINT "fail_on_purpose" CHECK ("clicks" < 0) NOT VALID`,
    );

    try {
      await expect(consumer.consumeOnce()).rejects.toThrow('fail_on_purpose');
      expect(await countRows(app, 'click_events')).toBe(0);
      expect(await countRows(app, 'link_daily_totals')).toBe(0);
    } finally {
      await dataSource.query(
        `ALTER TABLE "link_daily_breakdowns" DROP CONSTRAINT "fail_on_purpose"`,
      );
    }

    expect(await consumer.consumeOnce()).toBe(1);
    expect(await clickCount()).toBe('1');
  });

  it('reports what happened to each click', async () => {
    await recordClicks(app, [
      clickOn(link.id),
      clickOn(link.id, { userAgent: GOOGLEBOT }),
    ]);
    await consumeClicks(app);
    const [first = {}] = await streamMessages(app);
    await redisOf(app).xAdd(CLICK_STREAM_KEY, '*', first);
    await consumeClicks(app);

    expect(countedResults().sort()).toEqual([
      'bot',
      'duplicate',
      'persisted',
      'persisted',
      'recorded',
    ]);
  });

  it('reports how far behind it is, and zero once caught up', async () => {
    const setGauge = vi.spyOn(app.get(Metrics), 'setGauge');
    await recordClicks(app, [clickOn(link.id)]);

    await consumeClicks(app);

    const [[name, whileBehind], [, onceCaughtUp]] = setGauge.mock.calls as [
      [string, number],
      [string, number],
    ];
    expect(name).toBe('click_stream_lag');
    expect(whileBehind).toBeGreaterThanOrEqual(0);
    expect(whileBehind).toBeLessThan(10);
    expect(onceCaughtUp).toBe(0);
  });
});
