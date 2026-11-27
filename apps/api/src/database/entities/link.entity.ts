import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { StoredLinkStatus } from '../../common/link/link-state.js';
import { UuidPrimaryColumn } from '../columns.js';
import { Domain } from './domain.entity.js';
import { User } from './user.entity.js';
import { Workspace } from './workspace.entity.js';

/**
 * The constraint that guarantees a code is unique within its domain. A
 * violation carries this name, which is how the write path tells a collision
 * from other errors.
 */
export const LINK_CODE_UNIQUE_CONSTRAINT = 'uq_links_domain_id_code';

@Entity({ name: 'links' })
@Unique(LINK_CODE_UNIQUE_CONSTRAINT, ['domainId', 'code'])
@Index('idx_links_workspace_id_created_at', ['workspaceId', 'createdAt'])
@Check(
  'ck_links_destination_url_length',
  'char_length("destination_url") <= 2048',
)
@Check('ck_links_status', `"status" IN ('ACTIVE', 'DISABLED', 'BLOCKED')`)
export class Link {
  @UuidPrimaryColumn('pk_links')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  @ForeignKey(() => Workspace, {
    name: 'fk_links_workspace_id',
    onDelete: 'CASCADE',
  })
  workspaceId!: string;

  /** A domain cannot be removed while links still live on it. */
  @Column({ name: 'domain_id', type: 'uuid' })
  @ForeignKey(() => Domain, {
    name: 'fk_links_domain_id',
    onDelete: 'RESTRICT',
  })
  domainId!: string;

  /** Case-sensitive. Generated, or chosen by the user. */
  @Column({ type: 'varchar', length: 32, collation: 'C' })
  code!: string;

  /**
   * Where the link goes. During an A/B test this is the control, and the
   * fallback whenever a variant cannot be served.
   */
  @Column({ name: 'destination_url', type: 'text' })
  destinationUrl!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 16, default: StoredLinkStatus.Active })
  status!: StoredLinkStatus;

  /** `null` means the link never expires. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  /** Saved QR code styling; `null` means the defaults. */
  @Column({ name: 'qr_style', type: 'jsonb', nullable: true })
  qrStyle!: Record<string, unknown> | null;

  /** Rolled up by the analytics consumer. A 64-bit count, so a string. */
  @Column({ name: 'click_count', type: 'bigint', default: 0 })
  clickCount!: string;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  @ForeignKey(() => User, {
    name: 'fk_links_created_by_user_id',
    onDelete: 'SET NULL',
  })
  createdByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * Changes only when someone edits the link, never on a click. The click
   * roll-up must therefore update `click_count` with raw SQL: the ORM's
   * update helpers set this column on every update.
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
