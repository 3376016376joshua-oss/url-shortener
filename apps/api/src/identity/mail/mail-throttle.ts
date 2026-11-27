import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis-client.js';
import { redisGuardUnavailable } from '../redis-unavailable.js';
import { fingerprint } from '../tokens/secret-token.js';

/** At most this many mails of one kind go to one address per window. */
const MAX_MAILS_PER_WINDOW = 3;
const WINDOW_SECONDS = 3_600;

export const MailKind = {
  Verification: 'verification',
  PasswordReset: 'password_reset',
  Invitation: 'invitation',
} as const;
export type MailKind = (typeof MailKind)[keyof typeof MailKind];

/**
 * Stops the platform being used to flood an inbox (PRD section 6). Counted in
 * Redis; without Redis nothing is sent, because an unguarded mail endpoint is
 * worse than a refused one.
 */
@Injectable()
export class MailThrottle {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  /**
   * Takes one mail from the address's allowance for this kind, and says
   * whether there was one to take. Fails with 503 when Redis cannot answer.
   */
  async acquire(kind: MailKind, email: string): Promise<boolean> {
    const key = `mail:${kind}:${fingerprint(email)}`;
    try {
      const [sent] = await this.redis
        .multi()
        .incr(key)
        .expire(key, WINDOW_SECONDS, 'NX')
        .exec();
      return Number(sent) <= MAX_MAILS_PER_WINDOW;
    } catch (error) {
      throw redisGuardUnavailable('Mail throttle', error);
    }
  }
}
