import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import type {
  SessionList,
  UpdateProfileRequest,
} from '@url-shortener/contracts/identity';
import { DataSource, type EntityManager } from 'typeorm';
import { userActor } from '../../audit/audit-actor.js';
import { ApiException } from '../../common/errors/api-exception.js';
import { User } from '../../database/entities/user.entity.js';
import { PasswordHasher } from '../passwords/password-hasher.js';
import { Sessions, type IssuedSession } from '../sessions/sessions.js';
import { AccountAction, AccountAudit } from './account-audit.js';

/** A signed-in user's own profile, password, and sessions (ID-4). */
@Injectable()
export class ProfileService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly sessions: Sessions,
    private readonly accountAudit: AccountAudit,
  ) {}

  /**
   * Applies the change. A new password revokes every session of the account;
   * the caller is given a fresh one in return, so the device that changed the
   * password stays signed in while every other one is signed out.
   */
  async update(
    userId: string,
    request: UpdateProfileRequest,
    userAgent: string | undefined,
  ): Promise<IssuedSession | null> {
    const newPasswordHash = await this.checkPasswordChange(userId, request);
    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      if (request.name !== undefined) {
        await users.update({ id: userId }, { name: request.name });
      }
      if (newPasswordHash === null) {
        return null;
      }
      await users.update({ id: userId }, { passwordHash: newPasswordHash });
      return this.replaceSessions(manager, userId, userAgent);
    });
  }

  async listSessions(
    userId: string,
    currentSessionId: string | null,
  ): Promise<SessionList> {
    const sessions = await this.sessions.listLive(userId);
    return {
      items: sessions.map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.id === currentSessionId,
      })),
      nextCursor: null,
    };
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.sessions.revoke(
      this.dataSource.manager,
      userId,
      sessionId,
    );
    if (!revoked) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NotFound,
        'Session not found',
      );
    }
  }

  /** The hash to store, or `null` when the password is not being changed. */
  private async checkPasswordChange(
    userId: string,
    request: UpdateProfileRequest,
  ): Promise<string | null> {
    const { currentPassword, newPassword } = request;
    if (currentPassword === undefined || newPassword === undefined) {
      return null;
    }
    const user = await this.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: userId });
    if (!(await this.hasher.verify(currentPassword, user.passwordHash))) {
      // Not a 401: the caller is signed in, and must stay so in the dashboard.
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'currentPassword: is not your current password',
      );
    }
    return this.hasher.hash(newPassword);
  }

  private async replaceSessions(
    manager: EntityManager,
    userId: string,
    userAgent: string | undefined,
  ): Promise<IssuedSession> {
    await this.sessions.revokeAll(manager, userId);
    const issued = await this.sessions.issue(manager, userId, userAgent);
    await this.accountAudit.record(
      manager,
      userId,
      AccountAction.PasswordChanged,
      userActor(userId),
    );
    return issued;
  }
}
