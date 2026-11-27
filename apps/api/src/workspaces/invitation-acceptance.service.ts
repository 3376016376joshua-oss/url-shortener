import { Injectable } from '@nestjs/common';
import {
  WorkspaceQuota,
  type WorkspaceDetails,
} from '@url-shortener/contracts/workspaces';
import { DataSource, type EntityManager } from 'typeorm';
import { userActor } from '../audit/audit-actor.js';
import { AuditLog } from '../audit/audit-log.js';
import { User } from '../database/entities/user.entity.js';
import { WorkspaceInvitation } from '../database/entities/workspace-invitation.entity.js';
import { WorkspaceMember } from '../database/entities/workspace-member.entity.js';
import { Clock } from '../identity/clock.js';
import { invalidLinkError } from '../identity/tokens/invalid-link.js';
import { hashSecret } from '../identity/tokens/secret-token.js';
import { forbidden, quotaExceeded } from './workspace-errors.js';
import { lockWorkspace } from './workspace-lock.js';
import { toWorkspaceDetails } from './workspaces.service.js';

/** Turning an invitation into a membership (PRD section 6, ID-6). */
@Injectable()
export class InvitationAcceptanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
    private readonly auditLog: AuditLog,
  ) {}

  /**
   * Holding the token is not enough: the signed-in account must be the one
   * the invitation was sent to. The invitation is deleted on acceptance, so
   * the person can be invited again if they later leave.
   */
  accept(token: string, userId: string): Promise<WorkspaceDetails> {
    return this.dataSource.transaction(async (manager) => {
      const invitation = await this.findUsable(manager, token);
      const user = await manager
        .getRepository(User)
        .findOneByOrFail({ id: userId });
      if (user.email !== invitation.email) {
        throw forbidden(
          'This invitation was sent to a different email address',
        );
      }

      const workspace = await lockWorkspace(manager, invitation.workspaceId);
      const members = manager.getRepository(WorkspaceMember);
      const { workspaceId, role } = invitation;
      const existing = await members.findOneBy({ workspaceId, userId });
      if (existing === null) {
        if (
          (await members.countBy({ workspaceId })) >= WorkspaceQuota.Members
        ) {
          throw quotaExceeded(
            `A workspace can have at most ${WorkspaceQuota.Members} members`,
          );
        }
        await members.insert({ workspaceId, userId, role });
      }
      await manager
        .getRepository(WorkspaceInvitation)
        .delete({ id: invitation.id });
      await this.auditLog.record(
        {
          workspaceId,
          actor: userActor(userId),
          action: 'invitation.accepted',
          target: { type: 'invitation', id: invitation.id },
          metadata: { role: existing?.role ?? role },
        },
        manager,
      );
      return toWorkspaceDetails(workspace, existing?.role ?? role);
    });
  }

  private async findUsable(
    manager: EntityManager,
    token: string,
  ): Promise<WorkspaceInvitation> {
    const invitation = await manager
      .getRepository(WorkspaceInvitation)
      .findOne({
        where: { tokenHash: hashSecret(token) },
        lock: { mode: 'pessimistic_write' },
      });
    if (
      invitation === null ||
      invitation.expiresAt.getTime() <= this.clock.now().getTime()
    ) {
      throw invalidLinkError();
    }
    return invitation;
  }
}
