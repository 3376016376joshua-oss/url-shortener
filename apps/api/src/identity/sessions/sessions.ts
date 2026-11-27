import { Injectable } from '@nestjs/common';
import { DataSource, MoreThan, type EntityManager } from 'typeorm';
import { Session } from '../../database/entities/session.entity.js';
import { Clock } from '../clock.js';
import { generateSecretToken, hashSecret } from '../tokens/secret-token.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A session ends after this long without use... */
export const SESSION_IDLE_LIFETIME_MS = 14 * DAY_MS;
/** ...and at the latest this long after sign-in, however busy it is. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 90 * DAY_MS;
/** `last_seen_at` is written at most this often, not on every request. */
const LAST_SEEN_RESOLUTION_MS = MINUTE_MS;
const USER_AGENT_MAX_LENGTH = 255;

export interface IssuedSession {
  /** The cookie value. It exists only here; the database keeps its hash. */
  token: string;
  session: Session;
}

/** Server-side sessions: issued at sign-in, checked on every request. */
@Injectable()
export class Sessions {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  async issue(
    manager: EntityManager,
    userId: string,
    userAgent: string | undefined,
  ): Promise<IssuedSession> {
    const now = this.clock.now();
    const token = generateSecretToken();
    const session = await manager.getRepository(Session).save({
      userId,
      tokenHash: hashSecret(token),
      userAgent: userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
    });
    return { token, session };
  }

  /** The live session behind a token, marked as seen; `null` otherwise. */
  async resolve(token: string): Promise<Session | null> {
    const sessions = this.dataSource.getRepository(Session);
    const session = await sessions.findOneBy({ tokenHash: hashSecret(token) });
    if (session === null) {
      return null;
    }
    const now = this.clock.now();
    if (!this.isLive(session, now)) {
      await sessions.delete({ id: session.id });
      return null;
    }
    if (
      now.getTime() - session.lastSeenAt.getTime() >=
      LAST_SEEN_RESOLUTION_MS
    ) {
      await sessions.update({ id: session.id }, { lastSeenAt: now });
      session.lastSeenAt = now;
    }
    return session;
  }

  /** The user's live sessions, most recently used first. */
  listLive(userId: string): Promise<Session[]> {
    const now = this.clock.now();
    return this.dataSource.getRepository(Session).find({
      where: {
        userId,
        expiresAt: MoreThan(now),
        lastSeenAt: MoreThan(
          new Date(now.getTime() - SESSION_IDLE_LIFETIME_MS),
        ),
      },
      order: { lastSeenAt: 'DESC', id: 'DESC' },
    });
  }

  /** Ends one of the user's sessions. False when it is not theirs or is gone. */
  async revoke(
    manager: EntityManager,
    userId: string,
    sessionId: string,
  ): Promise<boolean> {
    const result = await manager
      .getRepository(Session)
      .delete({ id: sessionId, userId });
    return (result.affected ?? 0) > 0;
  }

  async revokeAll(manager: EntityManager, userId: string): Promise<void> {
    await manager.getRepository(Session).delete({ userId });
  }

  private isLive(session: Session, now: Date): boolean {
    const idleDeadline =
      session.lastSeenAt.getTime() + SESSION_IDLE_LIFETIME_MS;
    return (
      session.expiresAt.getTime() > now.getTime() &&
      idleDeadline > now.getTime()
    );
  }
}
