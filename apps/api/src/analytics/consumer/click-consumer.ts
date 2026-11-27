import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runsBackgroundWork } from '../../common/jobs/job-scheduler.js';
import {
  CounterName,
  GaugeName,
  Metrics,
} from '../../common/metrics/metrics.js';
import type { Env } from '../../config/env.schema.js';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis-client.js';
import { Clock } from '../clock.js';
import { fromStreamFields } from '../reduced-click.js';
import { ClickBatchWriter, type BatchOutcome } from './click-batch-writer.js';
import {
  acknowledgeEntries,
  claimStaleEntries,
  ensureConsumerGroup,
  isGroupMissing,
  readNewEntries,
  removeConsumer,
  trimEntriesOlderThan,
  type StreamEntry,
} from './click-stream.js';

const BATCH_SIZE = 500;
/** How long one read waits for clicks before the loop comes round again. */
const BLOCK_MS = 5_000;
/** Bounds every command on the consumer's connection; above `BLOCK_MS`. */
const COMMAND_TIMEOUT_MS = 10_000;
/** Entries pending this long belong to a consumer that will not finish them. */
const STALE_AFTER_MS = 60_000;
const RETRY_DELAY_MS = 1_000;
/** How often one read recreates a missing group before giving up. */
const GROUP_ATTEMPTS = 3;
const TRIM_INTERVAL_MS = 60_000;
/** Entries older than this leave the stream, processed or not. */
const STREAM_RETENTION_MS = 24 * 3_600_000;
const MS_PER_SECOND = 1_000;

export interface ConsumeOptions {
  /** Wait this long for new clicks. Omit to return at once when there are none. */
  blockMs?: number;
  /** Take over entries pending at least this long. */
  staleAfterMs?: number;
}

/**
 * Moves clicks from the Redis stream into Postgres (PRD section 10). Runs as
 * a loop in processes with the worker role, on its own connection because
 * its reads block. An entry is acknowledged only after its batch commits, so
 * a crash redelivers it and `event_id` keeps the redelivery harmless.
 */
@Injectable()
export class ClickConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ClickConsumer.name);
  private readonly consumerName = `${hostname()}-${randomUUID()}`;
  private readonly enabled: boolean;
  private connection: RedisClient | null = null;
  private loop: Promise<void> | null = null;
  private stopping = false;
  private lastTrimAt = 0;
  /** A batch that was read but could not be written yet; it goes first. */
  private unfinished: StreamEntry[] | null = null;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly writer: ClickBatchWriter,
    private readonly metrics: Metrics,
    private readonly clock: Clock,
  ) {
    this.enabled = runsBackgroundWork(
      config.get('PROCESS_ROLE', { infer: true }),
    );
  }

  onApplicationBootstrap(): void {
    if (this.enabled) {
      this.connection = this.openConnection();
      this.loop = this.run(this.connection);
    }
  }

  /**
   * Handles one batch: stale entries first, then new ones. Returns how many
   * entries it handled. Rejects when the batch could not be written; the
   * next call then retries that same batch before reading anything new, so
   * a database outage does not pull the whole stream into the pending list.
   */
  async consumeOnce(
    options: ConsumeOptions = {},
    redis: RedisClient = this.redis,
  ): Promise<number> {
    const { blockMs, staleAfterMs = STALE_AFTER_MS } = options;
    const entries =
      this.unfinished ?? (await this.read(redis, staleAfterMs, blockMs));
    this.reportLag(entries);
    if (entries.length === 0) {
      return 0;
    }
    this.unfinished = entries;
    const clicks = entries.flatMap(({ fields }) => {
      const click = fromStreamFields(fields);
      return click === null ? [] : [click];
    });
    const outcome = await this.writer.write(clicks);
    await acknowledgeEntries(
      redis,
      entries.map(({ id }) => id),
    );
    this.unfinished = null;
    this.reportOutcome(outcome, entries.length - clicks.length);
    return entries.length;
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    // Ends a read that is blocked waiting for clicks.
    if (this.connection?.isOpen === true) {
      this.connection.destroy();
    }
    await this.loop;
    if (this.enabled) {
      // The loop has ended, so nothing of ours is pending unless a batch
      // failed; those entries are stale-claimed by the next consumer.
      await removeConsumer(this.redis, this.consumerName).catch(
        () => undefined,
      );
    }
  }

  private openConnection(): RedisClient {
    const connection = this.redis.duplicate({
      // Unlike the shared client, wait out a reconnect instead of failing.
      disableOfflineQueue: false,
      commandOptions: { timeout: COMMAND_TIMEOUT_MS },
    });
    connection.on('error', (error: Error) => {
      this.logger.error(`Click consumer connection error: ${String(error)}`);
    });
    return connection;
  }

  private async run(connection: RedisClient): Promise<void> {
    while (!this.stopping) {
      try {
        if (!connection.isOpen) {
          await connection.connect();
        }
        await this.consumeOnce({ blockMs: BLOCK_MS }, connection);
        await this.trimWhenDue(connection);
      } catch (error) {
        if (this.stopping) {
          return;
        }
        this.logger.error(`Click consumer failed: ${String(error)}`);
        await sleep(RETRY_DELAY_MS, undefined, { ref: false });
      }
    }
  }

  private async read(
    redis: RedisClient,
    staleAfterMs: number,
    blockMs: number | undefined,
  ): Promise<StreamEntry[]> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.readBatch(redis, staleAfterMs, blockMs);
      } catch (error) {
        if (!isGroupMissing(error) || attempt === GROUP_ATTEMPTS) {
          throw error;
        }
        // The group does not exist: this is the first consumer ever, or
        // Redis lost the stream to a flush or a failover, possibly while we
        // were waiting on it. Create it and read again.
        await ensureConsumerGroup(redis);
      }
    }
  }

  private async readBatch(
    redis: RedisClient,
    staleAfterMs: number,
    blockMs: number | undefined,
  ): Promise<StreamEntry[]> {
    const name = this.consumerName;
    const stale = await claimStaleEntries(
      redis,
      name,
      staleAfterMs,
      BATCH_SIZE,
    );
    const room = BATCH_SIZE - stale.length;
    if (room === 0) {
      return stale;
    }
    // With stale work in hand, take what is there but do not wait for more.
    const wait = stale.length === 0 ? blockMs : undefined;
    return [...stale, ...(await readNewEntries(redis, name, room, wait))];
  }

  private async trimWhenDue(redis: RedisClient): Promise<void> {
    const now = this.clock.now().getTime();
    if (now - this.lastTrimAt < TRIM_INTERVAL_MS) {
      return;
    }
    this.lastTrimAt = now;
    await trimEntriesOlderThan(redis, new Date(now - STREAM_RETENTION_MS));
  }

  /** How far behind the consumer is: the age, in seconds, of its oldest click. */
  private reportLag(entries: readonly StreamEntry[]): void {
    const addedAt = entries.map(({ id }) => Number(id.split('-')[0]));
    const oldest = Math.min(...addedAt, this.clock.now().getTime());
    const lagMs = Math.max(this.clock.now().getTime() - oldest, 0);
    this.metrics.setGauge(GaugeName.ClickStreamLag, lagMs / MS_PER_SECOND);
  }

  private reportOutcome(outcome: BatchOutcome, malformed: number): void {
    const counts: Array<[string, number]> = [
      ['persisted', outcome.persisted],
      ['duplicate', outcome.duplicates],
      ['dropped', outcome.discarded + malformed],
    ];
    for (const [result, count] of counts) {
      for (let counted = 0; counted < count; counted += 1) {
        this.metrics.incrementCounter(CounterName.ClickEvents, { result });
      }
    }
    if (malformed > 0) {
      this.logger.warn(`Discarded ${malformed} malformed click stream entries`);
    }
  }
}
