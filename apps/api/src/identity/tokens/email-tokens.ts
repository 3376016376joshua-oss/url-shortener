import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  EmailToken,
  EmailTokenPurpose,
} from '../../database/entities/email-token.entity.js';
import { Clock } from '../clock.js';
import { generateSecretToken, hashSecret } from './secret-token.js';

const HOUR_MS = 3_600_000;
const LIFETIME_MS: Readonly<Record<EmailTokenPurpose, number>> = {
  [EmailTokenPurpose.VerifyEmail]: 24 * HOUR_MS,
  [EmailTokenPurpose.ResetPassword]: HOUR_MS,
};

/** Single-use tokens mailed to prove control of an address. */
@Injectable()
export class EmailTokens {
  constructor(private readonly clock: Clock) {}

  /**
   * A fresh token for the user. Earlier tokens of the same purpose stop
   * working, so only the newest mail's link is ever valid.
   */
  async issue(
    manager: EntityManager,
    userId: string,
    purpose: EmailTokenPurpose,
  ): Promise<string> {
    const tokens = manager.getRepository(EmailToken);
    await tokens.delete({ userId, purpose });
    const token = generateSecretToken();
    await tokens.insert({
      userId,
      purpose,
      tokenHash: hashSecret(token),
      expiresAt: new Date(this.clock.now().getTime() + LIFETIME_MS[purpose]),
    });
    return token;
  }

  /**
   * Uses the token up and returns whose it was, or `null` when it is unknown,
   * expired, or already used. One statement, so two requests racing with the
   * same token cannot both win.
   */
  async consume(
    manager: EntityManager,
    token: string,
    purpose: EmailTokenPurpose,
  ): Promise<string | null> {
    const now = this.clock.now();
    const result = await manager
      .createQueryBuilder()
      .update(EmailToken)
      .set({ usedAt: now })
      .where('token_hash = :tokenHash', { tokenHash: hashSecret(token) })
      .andWhere('purpose = :purpose', { purpose })
      .andWhere('used_at IS NULL')
      .andWhere('expires_at > :now', { now })
      .returning('user_id')
      .execute();
    const rows = result.raw as Array<{ user_id: string }>;
    return rows[0]?.user_id ?? null;
  }
}
