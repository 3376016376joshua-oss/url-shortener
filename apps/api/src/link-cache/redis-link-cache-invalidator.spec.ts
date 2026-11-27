import { describe, expect, it, vi } from 'vitest';
import type { RedisClient } from '../redis/redis-client.js';
import { RedisLinkCacheInvalidator } from './redis-link-cache-invalidator.js';

const TOMBSTONE_ARGUMENTS = [
  '{"invalidated":true}',
  { expiration: { type: 'PX', value: 5_000 } },
];

function createInvalidator(set: () => Promise<unknown>) {
  const redisSet = vi.fn(set);
  const incrementCounter = vi.fn();
  const invalidator = new RedisLinkCacheInvalidator(
    { set: redisSet } as unknown as RedisClient,
    { incrementCounter, setGauge: vi.fn() },
  );
  return { invalidator, redisSet, incrementCounter };
}

describe('RedisLinkCacheInvalidator', () => {
  it('overwrites the link key with a 5 second tombstone', async () => {
    const { invalidator, redisSet } = createInvalidator(() =>
      Promise.resolve('OK'),
    );

    await invalidator.invalidateLink('Go.Brand.com', 'Launch');

    expect(redisSet).toHaveBeenCalledExactlyOnceWith(
      'link:go.brand.com:Launch',
      ...TOMBSTONE_ARGUMENTS,
    );
  });

  it('overwrites the domain key with a 5 second tombstone', async () => {
    const { invalidator, redisSet } = createInvalidator(() =>
      Promise.resolve('OK'),
    );

    await invalidator.invalidateDomain('Go.Brand.com');

    expect(redisSet).toHaveBeenCalledExactlyOnceWith(
      'domain:go.brand.com',
      ...TOMBSTONE_ARGUMENTS,
    );
  });

  it('rides out a brief Redis failure without reporting a loss', async () => {
    const failOnce = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('OK');
    const { invalidator, redisSet, incrementCounter } =
      createInvalidator(failOnce);

    await invalidator.invalidateLink('go.brand.com', 'launch');

    expect(redisSet).toHaveBeenCalledTimes(2);
    expect(incrementCounter).not.toHaveBeenCalled();
  });

  it('never rejects: after three attempts it counts the loss and returns', async () => {
    const { invalidator, redisSet, incrementCounter } = createInvalidator(() =>
      Promise.reject(new Error('The client is offline')),
    );

    await expect(
      invalidator.invalidateLink('go.brand.com', 'launch'),
    ).resolves.toBeUndefined();

    expect(redisSet).toHaveBeenCalledTimes(3);
    expect(incrementCounter).toHaveBeenCalledExactlyOnceWith(
      'link_cache_invalidation_failures_total',
    );
  });
});
