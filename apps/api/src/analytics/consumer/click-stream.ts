import type { RedisClient } from '../../redis/redis-client.js';
import { CLICK_CONSUMER_GROUP, CLICK_STREAM_KEY } from '../redis-keys.js';

/** One entry of the click stream, as delivered to a consumer. */
export interface StreamEntry {
  id: string;
  fields: Readonly<Record<string, string>>;
}

interface DeliveredMessage {
  id: string;
  message: Record<string, string>;
}

/** Start of the stream: a new group also gets the clicks queued before it. */
const FROM_THE_BEGINNING = '0';
const NEVER_DELIVERED = '>';

const hasPrefix = (error: unknown, prefix: string): boolean =>
  error instanceof Error && error.message.startsWith(prefix);

/** Redis lost the group or the stream, for example after a flush or failover. */
export function isGroupMissing(error: unknown): boolean {
  return hasPrefix(error, 'NOGROUP');
}

/** Creates the stream and the consumer group unless they already exist. */
export async function ensureConsumerGroup(redis: RedisClient): Promise<void> {
  try {
    await redis.xGroupCreate(
      CLICK_STREAM_KEY,
      CLICK_CONSUMER_GROUP,
      FROM_THE_BEGINNING,
      { MKSTREAM: true },
    );
  } catch (error) {
    if (!hasPrefix(error, 'BUSYGROUP')) {
      throw error;
    }
  }
}

/**
 * Takes over entries that were delivered at least `minIdleMs` ago and never
 * acknowledged: the batch of a consumer that crashed, or our own failed one.
 */
export async function claimStaleEntries(
  redis: RedisClient,
  consumer: string,
  minIdleMs: number,
  count: number,
): Promise<StreamEntry[]> {
  const { messages } = await redis.xAutoClaim(
    CLICK_STREAM_KEY,
    CLICK_CONSUMER_GROUP,
    consumer,
    minIdleMs,
    FROM_THE_BEGINNING,
    { COUNT: count },
  );
  return messages.flatMap((entry) =>
    // An entry trimmed from the stream while pending comes back as null.
    entry === null ? [] : [{ id: entry.id, fields: entry.message }],
  );
}

/** Reads entries no consumer has seen, waiting up to `blockMs` for the first. */
export async function readNewEntries(
  redis: RedisClient,
  consumer: string,
  count: number,
  blockMs?: number,
): Promise<StreamEntry[]> {
  // The client types this reply loosely, because its shape depends on the
  // protocol version; with the client's defaults it is this one.
  const streams = (await redis.xReadGroup(
    CLICK_CONSUMER_GROUP,
    consumer,
    { key: CLICK_STREAM_KEY, id: NEVER_DELIVERED },
    blockMs === undefined ? { COUNT: count } : { COUNT: count, BLOCK: blockMs },
  )) as Array<{ messages: DeliveredMessage[] }> | null;
  return (streams ?? []).flatMap(({ messages }) =>
    messages.map((entry) => ({ id: entry.id, fields: entry.message })),
  );
}

export async function acknowledgeEntries(
  redis: RedisClient,
  ids: readonly string[],
): Promise<void> {
  if (ids.length > 0) {
    await redis.xAck(CLICK_STREAM_KEY, CLICK_CONSUMER_GROUP, [...ids]);
  }
}

/** Removes entries added before `cutoff`, processed or not. */
export async function trimEntriesOlderThan(
  redis: RedisClient,
  cutoff: Date,
): Promise<void> {
  // Entry ids start with the millisecond the entry was added.
  await redis.xTrim(CLICK_STREAM_KEY, 'MINID', String(cutoff.getTime()), {
    strategyModifier: '~',
  });
}

/**
 * Forgets a consumer name. Only safe when it has nothing pending, because
 * its pending entries would be forgotten with it.
 */
export async function removeConsumer(
  redis: RedisClient,
  consumer: string,
): Promise<void> {
  await redis.xGroupDelConsumer(
    CLICK_STREAM_KEY,
    CLICK_CONSUMER_GROUP,
    consumer,
  );
}
