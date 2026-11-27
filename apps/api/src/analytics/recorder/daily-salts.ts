import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis-client.js';
import { VISITOR_DATA_TTL_SECONDS, visitorSaltKey } from '../redis-keys.js';

const SALT_BYTES = 32;

/**
 * The random salt of each UTC day. It lives only in Redis, with an expiry,
 * and is read from there for every click rather than kept in the process: it
 * is never written to Postgres or a log, so it appears in no backup, and once
 * it expires no visitor hash of that day can be recomputed.
 */
@Injectable()
export class DailySalts {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  /** The day's salt, created on first use. Every process gets the same one. */
  async forDay(day: string): Promise<string> {
    const candidate = randomBytes(SALT_BYTES).toString('base64url');
    // One round trip: NX keeps the first salt of the day, and GET returns it
    // to everyone who comes later (`null` means ours was the first).
    const existing = await this.redis.set(visitorSaltKey(day), candidate, {
      expiration: { type: 'EX', value: VISITOR_DATA_TTL_SECONDS },
      condition: 'NX',
      GET: true,
    });
    return existing ?? candidate;
  }
}
