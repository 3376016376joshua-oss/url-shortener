import { Injectable } from '@nestjs/common';
import type { WorkspaceDetails } from '@url-shortener/contracts/workspaces';
import { DataSource } from 'typeorm';
import { auditActor } from '../audit/audit-actor.js';
import { AuditLog } from '../audit/audit-log.js';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { Workspace } from '../database/entities/workspace.entity.js';
import type { Principal } from '../identity/principal.js';
import { createWorkspaceWithOwner } from '../identity/workspace-provisioning.js';
import { notFound } from './workspace-errors.js';

export function toWorkspaceDetails(
  workspace: Workspace,
  role: WorkspaceRole,
): WorkspaceDetails {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

/** Creating, reading, and renaming workspaces (PRD section 6, ID-5). */
@Injectable()
export class WorkspacesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLog,
  ) {}

  async create(userId: string, name: string): Promise<WorkspaceDetails> {
    const workspace = await this.dataSource.transaction((manager) =>
      createWorkspaceWithOwner(manager, this.auditLog, name, userId),
    );
    return toWorkspaceDetails(workspace, WorkspaceRole.Owner);
  }

  async get(
    workspaceId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceDetails> {
    const workspace = await this.dataSource
      .getRepository(Workspace)
      .findOneBy({ id: workspaceId });
    if (workspace === null) {
      throw notFound('Workspace');
    }
    return toWorkspaceDetails(workspace, role);
  }

  async rename(
    workspaceId: string,
    name: string,
    principal: Principal,
  ): Promise<WorkspaceDetails> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(Workspace)
        .update({ id: workspaceId }, { name });
      await this.auditLog.record(
        {
          workspaceId,
          actor: auditActor(principal),
          action: 'workspace.renamed',
          target: { type: 'workspace', id: workspaceId },
          metadata: { name },
        },
        manager,
      );
    });
    return this.get(workspaceId, WorkspaceRole.Owner);
  }
}
