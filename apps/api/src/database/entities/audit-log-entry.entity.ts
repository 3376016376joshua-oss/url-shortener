import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
} from 'typeorm';
import { UuidPrimaryColumn } from '../columns.js';
import { Workspace } from './workspace.entity.js';

export const AuditActorType = {
  User: 'user',
  ApiKey: 'api_key',
  System: 'system',
} as const;
export type AuditActorType =
  (typeof AuditActorType)[keyof typeof AuditActorType];

/** A record of who changed what. Append-only. */
@Entity({ name: 'audit_log' })
@Index('idx_audit_log_workspace_id_created_at', ['workspaceId', 'createdAt'])
@Check(
  'ck_audit_log_actor_type',
  `"actor_type" IN ('user', 'api_key', 'system')`,
)
export class AuditLogEntry {
  @UuidPrimaryColumn('pk_audit_log')
  id!: string;

  /** `null` for platform-level actions that belong to no workspace. */
  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  @ForeignKey(() => Workspace, {
    name: 'fk_audit_log_workspace_id',
    onDelete: 'CASCADE',
  })
  workspaceId!: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 16 })
  actorType!: AuditActorType;

  /** A user id or API key id; `null` for the system. */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  /** For example `link.created` or `domain.verified`. */
  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 32 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
