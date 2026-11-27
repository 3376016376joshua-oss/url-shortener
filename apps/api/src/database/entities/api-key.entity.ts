import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  Unique,
} from 'typeorm';
import { UuidPrimaryColumn } from '../columns.js';
import { User } from './user.entity.js';
import { Workspace } from './workspace.entity.js';

/** A workspace credential for programmatic use. */
@Entity({ name: 'api_keys' })
@Unique('uq_api_keys_key_hash', ['keyHash'])
@Index('idx_api_keys_workspace_id', ['workspaceId'])
export class ApiKey {
  @UuidPrimaryColumn('pk_api_keys')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  @ForeignKey(() => Workspace, {
    name: 'fk_api_keys_workspace_id',
    onDelete: 'CASCADE',
  })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /** The first characters of the key, kept so a user can tell keys apart. */
  @Column({ name: 'key_prefix', type: 'varchar', length: 16 })
  keyPrefix!: string;

  /** SHA-256 of the key. The key itself is shown once and never stored. */
  @Column({ name: 'key_hash', type: 'bytea' })
  keyHash!: Buffer;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  @ForeignKey(() => User, {
    name: 'fk_api_keys_created_by_user_id',
    onDelete: 'SET NULL',
  })
  createdByUserId!: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
