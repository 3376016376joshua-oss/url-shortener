import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis-client.js';
import {
  decodeDomain,
  decodeLink,
  encodeDomain,
  encodeLink,
  type CacheRead,
  type CachedDomain,
  type CachedLink,
} from './cache-entry.js';
import {
  ENTRY_TTL_MS,
  NEGATIVE_TTL_MS,
  domainKey,
  linkKey,
  linkTtlMs,
} from './cache-policy.js';

/** Both keys of one redirect lookup, as one round trip found them. */
export interface CacheSnapshot {
  domain: CacheRead<CachedDomain>;
  link: CacheRead<CachedLink>;
}

/**
 * The Redis side of the redirect lookup (PRD section 7). Every method rejects
 * when Redis cannot answer; the caller decides how to carry on without it.
 */
@Injectable()
export class LinkCache {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  /** The whole lookup in one `MGET`. */
  async read(host: string, code: string): Promise<CacheSnapshot> {
    const [domain = null, link = null] = await this.redis.mGet([
      domainKey(host),
      linkKey(host, code),
    ]);
    return { domain: decodeDomain(domain), link: decodeLink(link) };
  }

  /** Caches the domain serving a host, or `null` when no domain serves it. */
  async populateDomain(
    host: string,
    domain: CachedDomain | null,
  ): Promise<void> {
    const ttlMs = domain === null ? NEGATIVE_TTL_MS : ENTRY_TTL_MS;
    await this.setIfAbsent(domainKey(host), encodeDomain(domain), ttlMs);
  }

  /** Caches a link, or `null` when the code does not exist on the host. */
  async populateLink(
    host: string,
    code: string,
    link: CachedLink | null,
    now: Date,
  ): Promise<void> {
    const ttlMs =
      link === null ? NEGATIVE_TTL_MS : linkTtlMs(link.expiresAt, now);
    await this.setIfAbsent(linkKey(host, code), encodeLink(link), ttlMs);
  }

  /**
   * Never overwrites: if a write left a tombstone since the row was read, the
   * row may be stale, and the tombstone must win.
   */
  private async setIfAbsent(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<void> {
    await this.redis.set(key, value, {
      condition: 'NX',
      expiration: { type: 'PX', value: ttlMs },
    });
  }
}
