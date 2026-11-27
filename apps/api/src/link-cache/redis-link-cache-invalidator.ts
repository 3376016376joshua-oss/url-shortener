import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CounterName, Metrics } from '../common/metrics/metrics.js';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis-client.js';
import { TOMBSTONE_ENTRY } from './cache-entry.js';
import { TOMBSTONE_TTL_MS, domainKey, linkKey } from './cache-policy.js';
import { LinkCacheInvalidator } from './link-cache-invalidator.js';

/**
 * Waits before each further attempt. A lost invalidation can keep a stale
 * entry alive for its whole TTL, so a brief Redis hiccup is worth riding out;
 * a real outage still returns within a fraction of a second.
 */
const RETRY_DELAYS_MS: readonly number[] = [50, 150];

/**
 * Invalidates by overwriting the key with a short-lived tombstone rather than
 * deleting it. A reader that loaded the old row before the commit would write
 * it back over a deleted key; its `SET NX` fails against a tombstone.
 */
@Injectable()
export class RedisLinkCacheInvalidator extends LinkCacheInvalidator {
  private readonly logger = new Logger(RedisLinkCacheInvalidator.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly metrics: Metrics,
  ) {
    super();
  }

  invalidateLink(hostname: string, code: string): Promise<void> {
    return this.tombstone(linkKey(hostname.toLowerCase(), code));
  }

  invalidateDomain(hostname: string): Promise<void> {
    return this.tombstone(domainKey(hostname.toLowerCase()));
  }

  private async tombstone(key: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.redis.set(key, TOMBSTONE_ENTRY, {
          expiration: { type: 'PX', value: TOMBSTONE_TTL_MS },
        });
        return;
      } catch (error) {
        const retryDelayMs = RETRY_DELAYS_MS[attempt];
        if (retryDelayMs === undefined) {
          this.reportLostInvalidation(key, error);
          return;
        }
        await sleep(retryDelayMs);
      }
    }
  }

  /** The write already committed, so the caller is not failed; the TTL bounds the staleness. */
  private reportLostInvalidation(key: string, error: unknown): void {
    this.metrics.incrementCounter(CounterName.LinkCacheInvalidationFailures);
    this.logger.error(
      `Could not invalidate ${key}; a stale entry may be served until it expires: ${String(error)}`,
    );
  }
}
