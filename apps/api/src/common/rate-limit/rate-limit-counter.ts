import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis-client.js';

export interface WindowCount {
  /** Requests counted in the current window, this one included. */
  count: number;
  /** Time left until the window ends and the count starts again. */
  resetInMs: number;
}

/**
 * Counts one request against every key in a single atomic step. The first
 * request of a window starts its clock; because the increment and the expiry
 * happen together, a key can never be left counting forever.
 */
const COUNT_REQUEST_SCRIPT = `
local results = {}
for index, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  local ttl = redis.call('PTTL', key)
  if count == 1 or ttl < 0 then
    redis.call('PEXPIRE', key, ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  results[#results + 1] = count
  results[#results + 1] = ttl
end
return results
`;

/** Fixed-window request counters, kept in Redis so every replica shares them. */
@Injectable()
export class RateLimitCounter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  /**
   * Counts a request against each key, in one Redis round trip. Rejects when
   * Redis is unavailable; the caller decides whether that fails open or closed.
   */
  async count(keys: string[], windowMs: number): Promise<WindowCount[]> {
    const reply = (await this.redis.eval(COUNT_REQUEST_SCRIPT, {
      keys,
      arguments: [String(windowMs)],
    })) as number[];

    return keys.map((_key, index) => ({
      count: Number(reply[index * 2]),
      resetInMs: Number(reply[index * 2 + 1]),
    }));
  }
}
