import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis-client.js';
import { redisGuardUnavailable } from '../redis-unavailable.js';
import { fingerprint } from '../tokens/secret-token.js';

const MINUTE_SECONDS = 60;

/** 5 failures for one account from one address in 15 minutes lock that pair. */
const ADDRESS_FAILURE_LIMIT = 5;
const ADDRESS_WINDOW_SECONDS = 15 * MINUTE_SECONDS;
/** 50 failures for one account from anywhere in an hour lock it for everyone. */
const ACCOUNT_FAILURE_LIMIT = 50;
const ACCOUNT_WINDOW_SECONDS = 60 * MINUTE_SECONDS;
const LOCK_SECONDS = 15 * MINUTE_SECONDS;

export type LockScope = 'address' | 'account';

/**
 * Every key of one account shares a hash tag, so they live on one Redis
 * Cluster slot. The account is named by a hash of the email: an unknown email
 * is counted exactly like a real one, and no address is stored in Redis.
 */
function keysFor(email: string, address: string) {
  const account = `signin:{${fingerprint(email)}}`;
  return {
    addressFailures: `${account}:failures:${address}`,
    addressLock: `${account}:lock:${address}`,
    accountFailures: `${account}:failures`,
    accountLock: `${account}:lock`,
    /** The addresses that have keys above, so a reset can find them. */
    addresses: `${account}:addresses`,
  };
}

/**
 * Slows password guessing (PRD section 6). The counters live in Redis; when
 * Redis cannot answer, every method fails with 503, so sign-in is refused
 * rather than left unguarded.
 */
@Injectable()
export class SignInLockout {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async isLocked(email: string, address: string): Promise<boolean> {
    const keys = keysFor(email, address);
    return this.guarded(
      async () =>
        (await this.redis.exists([keys.addressLock, keys.accountLock])) > 0,
    );
  }

  /** Counts a failure and returns the lock it triggered, if any. */
  async recordFailure(
    email: string,
    address: string,
  ): Promise<LockScope | null> {
    const keys = keysFor(email, address);
    return this.guarded(async () => {
      const [addressFailures, , accountFailures] = await this.redis
        .multi()
        .incr(keys.addressFailures)
        .expire(keys.addressFailures, ADDRESS_WINDOW_SECONDS, 'NX')
        .incr(keys.accountFailures)
        .expire(keys.accountFailures, ACCOUNT_WINDOW_SECONDS, 'NX')
        .sAdd(keys.addresses, address)
        .expire(keys.addresses, ACCOUNT_WINDOW_SECONDS)
        .exec();
      if (Number(accountFailures) >= ACCOUNT_FAILURE_LIMIT) {
        await this.lock(keys.accountLock, keys.accountFailures);
        return 'account';
      }
      if (Number(addressFailures) >= ADDRESS_FAILURE_LIMIT) {
        await this.lock(keys.addressLock, keys.addressFailures);
        return 'address';
      }
      return null;
    });
  }

  /** A successful sign-in forgives that address's earlier failures. */
  async recordSuccess(email: string, address: string): Promise<void> {
    const keys = keysFor(email, address);
    await this.guarded(() => this.redis.del(keys.addressFailures));
  }

  /** Lifts every lock and counter of the account, after a password reset. */
  async clear(email: string): Promise<void> {
    const keys = keysFor(email, '');
    await this.guarded(async () => {
      const addresses = await this.redis.sMembers(keys.addresses);
      const perAddress = addresses.flatMap((address) => {
        const { addressFailures, addressLock } = keysFor(email, address);
        return [addressFailures, addressLock];
      });
      await this.redis.del([
        ...perAddress,
        keys.accountFailures,
        keys.accountLock,
        keys.addresses,
      ]);
    });
  }

  /** The lock replaces the counter, so the next window starts from zero. */
  private async lock(lockKey: string, failuresKey: string): Promise<void> {
    await this.redis
      .multi()
      .set(lockKey, '1', { expiration: { type: 'EX', value: LOCK_SECONDS } })
      .del(failuresKey)
      .exec();
  }

  private async guarded<T>(command: () => Promise<T>): Promise<T> {
    try {
      return await command();
    } catch (error) {
      throw redisGuardUnavailable('Sign-in lockout', error);
    }
  }
}
