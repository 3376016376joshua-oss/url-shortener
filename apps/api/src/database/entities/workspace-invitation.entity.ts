import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Unique,
} from 'typeorm';
import { UuidPrimaryColumn } from '../columns.js';
import { User } from './user.entity.js';
import type { WorkspaceRole } from './workspace-member.entity.js';
import { Workspace } from './workspace.entity.js';

/**
 * A pending invitation. The row is deleted when it is accepted, so the same
 * person can be invited again later.
 */
@Entity({ name: 'workspace_invitations' })
@Unique('uq_workspace_invitations_token_hash', ['tokenHash'])
@Unique('uq_workspace_invitations_workspace_id_email', ['workspaceId', 'email'])
@Check('ck_workspace_invitations_role', `"role" IN ('admin', 'member')`)
export class WorkspaceInvitation {
  @UuidPrimaryColumn('pk_workspace_invitations')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  @ForeignKey(() => Workspace, {
    name: 'fk_workspace_invitations_workspace_id',
    onDelete: 'CASCADE',
  })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: WorkspaceRole;

  @Column({ name: 'token_hash', type: 'bytea' })
  tokenHash!: Buffer;

  @Column({ name: 'invited_by_user_id', type: 'uuid', nullable: true })
  @ForeignKey(() => User, {
    name: 'fk_workspace_invitations_invited_by_user_id',
    onDelete: 'SET NULL',
  })
  invitedByUserId!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
