import { Injectable } from '@nestjs/common';
import type { Member, MemberList } from '@url-shortener/contracts/workspaces';
import { DataSource, type EntityManager } from 'typeorm';
import { userActor } from '../audit/audit-actor.js';
import { AuditLog } from '../audit/audit-log.js';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../database/entities/workspace-member.entity.js';
import { mayRemoveMember } from './member-rules.js';
import { conflict, forbidden, notFound } from './workspace-errors.js';
import { lockWorkspace } from './workspace-lock.js';

interface MemberRow {
  user_id: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  created_at: Date;
}

/** Members in the order they joined; `$2` narrows the list to one user. */
const MEMBERS_QUERY = `
  SELECT member."user_id", account."email", account."name", member."role",
         member."created_at"
    FROM "workspace_members" member
    JOIN "users" account ON account."id" = member."user_id"
   WHERE member."workspace_id" = $1
     AND ($2::uuid IS NULL OR member."user_id" = $2::uuid)
   ORDER BY member."created_at", member."user_id"`;

const toMember = (row: MemberRow): Member => ({
  userId: row.user_id,
  email: row.email,
  name: row.name,
  role: row.role,
  joinedAt: row.created_at.toISOString(),
});

/** Who belongs to a workspace, and with which role (PRD section 6, ID-5). */
@Injectable()
export class MembersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLog,
  ) {}

  async list(workspaceId: string): Promise<MemberList> {
    const rows = await this.read(this.dataSource.manager, workspaceId, null);
    return { items: rows.map(toMember), nextCursor: null };
  }

  /** Only owners call this; the controller has checked. */
  async changeRole(
    workspaceId: string,
    targetUserId: string,
    role: WorkspaceRole,
    actorUserId: string,
  ): Promise<Member> {
    return this.dataSource.transaction(async (manager) => {
      await lockWorkspace(manager, workspaceId);
      const target = await this.find(manager, workspaceId, targetUserId);
      if (target.role !== role) {
        if (target.role === WorkspaceRole.Owner) {
          await this.requireAnotherOwner(manager, workspaceId, 'demoted');
        }
        await manager
          .getRepository(WorkspaceMember)
          .update({ workspaceId, userId: targetUserId }, { role });
        await this.audit(manager, workspaceId, actorUserId, {
          action: 'member.role_changed',
          targetUserId,
          metadata: { from: target.role, to: role },
        });
      }
      return toMember({ ...target, role });
    });
  }

  /** Removes a member, or lets the actor leave when the target is them. */
  async remove(
    workspaceId: string,
    targetUserId: string,
    actor: { userId: string; role: WorkspaceRole },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockWorkspace(manager, workspaceId);
      const target = await this.find(manager, workspaceId, targetUserId);
      const leaving = targetUserId === actor.userId;
      if (!leaving && !mayRemoveMember(actor.role, target.role)) {
        throw forbidden(
          `Removing a workspace ${target.role} needs the owner role`,
        );
      }
      if (target.role === WorkspaceRole.Owner) {
        await this.requireAnotherOwner(manager, workspaceId, 'removed');
      }
      await manager
        .getRepository(WorkspaceMember)
        .delete({ workspaceId, userId: targetUserId });
      await this.audit(manager, workspaceId, actor.userId, {
        action: leaving ? 'member.left' : 'member.removed',
        targetUserId,
        metadata: { role: target.role },
      });
    });
  }

  private async find(
    manager: EntityManager,
    workspaceId: string,
    userId: string,
  ): Promise<MemberRow> {
    const [row] = await this.read(manager, workspaceId, userId);
    if (row === undefined) {
      throw notFound('Member');
    }
    return row;
  }

  private read(
    manager: EntityManager,
    workspaceId: string,
    userId: string | null,
  ): Promise<MemberRow[]> {
    return manager.query(MEMBERS_QUERY, [workspaceId, userId]);
  }

  /** A workspace always has an owner (PRD section 3). */
  private async requireAnotherOwner(
    manager: EntityManager,
    workspaceId: string,
    change: 'demoted' | 'removed',
  ): Promise<void> {
    const owners = await manager
      .getRepository(WorkspaceMember)
      .countBy({ workspaceId, role: WorkspaceRole.Owner });
    if (owners <= 1) {
      throw conflict(`The last owner of a workspace cannot be ${change}`);
    }
  }

  private audit(
    manager: EntityManager,
    workspaceId: string,
    actorUserId: string,
    change: {
      action: string;
      targetUserId: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    return this.auditLog.record(
      {
        workspaceId,
        actor: userActor(actorUserId),
        action: change.action,
        target: { type: 'member', id: change.targetUserId },
        metadata: change.metadata,
      },
      manager,
    );
  }
}
