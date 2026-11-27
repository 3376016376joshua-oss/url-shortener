import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import {
  WorkspaceQuota,
  type CreateInvitationRequest,
  type Invitation,
  type InvitationList,
  type InvitationRole,
} from '@url-shortener/contracts/workspaces';
import { DataSource, MoreThan, Not } from 'typeorm';
import { userActor } from '../audit/audit-actor.js';
import { AuditLog } from '../audit/audit-log.js';
import { ApiException } from '../common/errors/api-exception.js';
import { User } from '../database/entities/user.entity.js';
import { WorkspaceInvitation } from '../database/entities/workspace-invitation.entity.js';
import { WorkspaceMember } from '../database/entities/workspace-member.entity.js';
import { Workspace } from '../database/entities/workspace.entity.js';
import { Clock } from '../identity/clock.js';
import { AccountMails } from '../identity/mail/account-mails.js';
import { MailKind, MailThrottle } from '../identity/mail/mail-throttle.js';
import {
  generateSecretToken,
  hashSecret,
} from '../identity/tokens/secret-token.js';
import { conflict, notFound, quotaExceeded } from './workspace-errors.js';

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export const toInvitation = (invitation: WorkspaceInvitation): Invitation => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role as InvitationRole,
  invitedByUserId: invitation.invitedByUserId,
  expiresAt: invitation.expiresAt.toISOString(),
  createdAt: invitation.createdAt.toISOString(),
});

/** Inviting people to a workspace by email (PRD section 6, ID-6). */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
    private readonly throttle: MailThrottle,
    private readonly mails: AccountMails,
    private readonly auditLog: AuditLog,
  ) {}

  async list(workspaceId: string): Promise<InvitationList> {
    const invitations = await this.dataSource
      .getRepository(WorkspaceInvitation)
      .find({
        where: { workspaceId, expiresAt: MoreThan(this.clock.now()) },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
    return { items: invitations.map(toInvitation), nextCursor: null };
  }

  /**
   * Invites the address, or renews its pending invitation: inviting again is
   * how an admin sends the mail again, and the earlier link stops working.
   */
  async create(
    workspaceId: string,
    request: CreateInvitationRequest,
    inviterUserId: string,
  ): Promise<Invitation> {
    const { email, role } = request;
    await this.requireRoomFor(workspaceId, email);
    if (!(await this.throttle.acquire(MailKind.Invitation, email))) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RateLimited,
        'Too many invitations were sent to this address; try again in an hour',
      );
    }

    const token = generateSecretToken();
    const invitation = await this.dataSource.transaction(async (manager) => {
      const invitations = manager.getRepository(WorkspaceInvitation);
      await invitations.upsert(
        {
          workspaceId,
          email,
          role,
          tokenHash: hashSecret(token),
          invitedByUserId: inviterUserId,
          expiresAt: new Date(
            this.clock.now().getTime() + INVITATION_LIFETIME_MS,
          ),
        },
        ['workspaceId', 'email'],
      );
      const saved = await invitations.findOneByOrFail({ workspaceId, email });
      await this.auditLog.record(
        {
          workspaceId,
          actor: userActor(inviterUserId),
          action: 'invitation.created',
          target: { type: 'invitation', id: saved.id },
          metadata: { email, role },
        },
        manager,
      );
      return saved;
    });
    await this.sendMail(workspaceId, inviterUserId, email, token);
    return toInvitation(invitation);
  }

  async revoke(
    workspaceId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const invitations = manager.getRepository(WorkspaceInvitation);
      const invitation = await invitations.findOneBy({
        id: invitationId,
        workspaceId,
      });
      if (invitation === null) {
        throw notFound('Invitation');
      }
      await invitations.delete({ id: invitation.id });
      await this.auditLog.record(
        {
          workspaceId,
          actor: userActor(actorUserId),
          action: 'invitation.revoked',
          target: { type: 'invitation', id: invitation.id },
          metadata: { email: invitation.email },
        },
        manager,
      );
    });
  }

  /**
   * Refuses someone who is already a member, and an invitation the member
   * quota could never honour: pending invitations count as taken seats.
   */
  private async requireRoomFor(
    workspaceId: string,
    email: string,
  ): Promise<void> {
    const [members, alreadyMember] = await Promise.all([
      this.dataSource.getRepository(WorkspaceMember).countBy({ workspaceId }),
      this.dataSource
        .createQueryBuilder(WorkspaceMember, 'member')
        .innerJoin(User, 'account', 'account.id = member.user_id')
        .where('member.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.email = :email', { email })
        .getExists(),
    ]);
    if (alreadyMember) {
      throw conflict('This person is already a member of the workspace');
    }
    const otherInvitations = await this.dataSource
      .getRepository(WorkspaceInvitation)
      .countBy({
        workspaceId,
        email: Not(email),
        expiresAt: MoreThan(this.clock.now()),
      });
    if (members + otherInvitations >= WorkspaceQuota.Members) {
      throw quotaExceeded(
        `A workspace can have at most ${WorkspaceQuota.Members} members, pending invitations included`,
      );
    }
  }

  private async sendMail(
    workspaceId: string,
    inviterUserId: string,
    email: string,
    token: string,
  ): Promise<void> {
    const [workspace, inviter] = await Promise.all([
      this.dataSource
        .getRepository(Workspace)
        .findOneByOrFail({ id: workspaceId }),
      this.dataSource
        .getRepository(User)
        .findOneByOrFail({ id: inviterUserId }),
    ]);
    this.mails.sendInvitation(email, {
      workspaceName: workspace.name,
      inviterName: inviter.name,
      token,
    });
  }
}
