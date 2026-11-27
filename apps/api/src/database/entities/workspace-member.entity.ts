import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity.js';
import { Workspace } from './workspace.entity.js';

export const WorkspaceRole = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
} as const;
export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];

@Entity({ name: 'workspace_members' })
@Index('idx_workspace_members_user_id', ['userId'])
@Check('ck_workspace_members_role', `"role" IN ('owner', 'admin', 'member')`)
export class WorkspaceMember {
  @PrimaryColumn({
    name: 'workspace_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_workspace_members',
  })
  @ForeignKey(() => Workspace, {
    name: 'fk_workspace_members_workspace_id',
    onDelete: 'CASCADE',
  })
  workspaceId!: string;

  @PrimaryColumn({
    name: 'user_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_workspace_members',
  })
  @ForeignKey(() => User, {
    name: 'fk_workspace_members_user_id',
    onDelete: 'CASCADE',
  })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: WorkspaceRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
