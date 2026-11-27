import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditLog, type AuditEntry } from '../../audit/audit-log.js';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity.js';

export const AccountAction = {
  SignedIn: 'user.signed_in',
  SignedOut: 'user.signed_out',
  SignInLocked: 'user.sign_in_locked',
  PasswordChanged: 'user.password_changed',
  PasswordReset: 'user.password_reset',
} as const;
export type AccountAction = (typeof AccountAction)[keyof typeof AccountAction];

/**
 * Audits what happens to an account rather than to a workspace. The audit log
 * is read per workspace, so the entry is written once for each workspace the
 * user belongs to: every admin who should know about a member's sign-in or
 * password change finds it in their own log. A user in no workspace gets one
 * platform-level entry.
 */
@Injectable()
export class AccountAudit {
  constructor(private readonly auditLog: AuditLog) {}

  async record(
    manager: EntityManager,
    userId: string,
    action: AccountAction,
    actor: AuditEntry['actor'],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const memberships = await manager
      .getRepository(WorkspaceMember)
      .find({ where: { userId }, select: { workspaceId: true } });
    const workspaceIds: Array<string | null> =
      memberships.length > 0
        ? memberships.map(({ workspaceId }) => workspaceId)
        : [null];
    for (const workspaceId of workspaceIds) {
      await this.auditLog.record(
        {
          workspaceId,
          actor,
          action,
          target: { type: 'user', id: userId },
          ...(metadata === undefined ? {} : { metadata }),
        },
        manager,
      );
    }
  }
}
