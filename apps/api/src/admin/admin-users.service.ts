import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { DataSource } from 'typeorm';
import { AuditLog } from '../audit/audit-log.js';
import { ApiException } from '../common/errors/api-exception.js';
import { Session } from '../database/entities/session.entity.js';
import { User } from '../database/entities/user.entity.js';
import type { Principal } from '../identity/principal.js';
import { adminActor, notFound } from './admin-audit.js';

export interface AdminUserView {
  id: string;
  disabledAt: Date | null;
}

interface AccountChange {
  user: User;
  changed: boolean;
}

/** Disables abusive accounts, and restores them (PRD section 13). */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditLog,
  ) {}

  /**
   * Disables the account and signs it out everywhere, in one transaction:
   * a disabled account must not keep a working session.
   */
  async disable(admin: Principal, userId: string): Promise<AdminUserView> {
    if (admin.userId === userId) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'You cannot disable your own account',
      );
    }
    const change = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (user === null) {
        throw notFound('User');
      }
      // Sessions go even when the account was already disabled, so a retry
      // repairs anything an earlier attempt left behind.
      await manager.delete(Session, { userId });
      if (user.disabledAt !== null) {
        return { user, changed: false };
      }
      user.disabledAt = new Date();
      await manager.save(user);
      return { user, changed: true };
    });
    return this.report(admin, 'user.disabled', change);
  }

  async enable(admin: Principal, userId: string): Promise<AdminUserView> {
    const change = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (user === null) {
        throw notFound('User');
      }
      if (user.disabledAt === null) {
        return { user, changed: false };
      }
      user.disabledAt = null;
      await manager.save(user);
      return { user, changed: true };
    });
    return this.report(admin, 'user.enabled', change);
  }

  private async report(
    admin: Principal,
    action: string,
    { user, changed }: AccountChange,
  ): Promise<AdminUserView> {
    if (changed) {
      await this.audit.record({
        // An account belongs to no single workspace.
        workspaceId: null,
        actor: adminActor(admin),
        action,
        target: { type: 'user', id: user.id },
      });
    }
    return { id: user.id, disabledAt: user.disabledAt };
  }
}
