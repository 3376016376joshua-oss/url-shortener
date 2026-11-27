import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { StoredLinkStatus } from '../../common/link/link-state.js';

/**
 * The constraint that guarantees short codes are unique. A violation carries
 * this name, which is how the write path tells a collision from other errors.
 */
export const SHORT_CODE_UNIQUE_CONSTRAINT = 'uq_url_mappings_short_code';

@Entity({ name: 'url_mappings' })
@Unique(SHORT_CODE_UNIQUE_CONSTRAINT, ['shortCode'])
@Check('ck_url_mappings_long_url_length', 'char_length("long_url") <= 2048')
@Check('ck_url_mappings_status', `"status" IN ('ACTIVE', 'DISABLED')`)
export class UrlMapping {
  /** A 64-bit identity, so it is a string in JavaScript. Never exposed. */
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_url_mappings',
  })
  id!: string;

  @Column({ name: 'short_code', type: 'varchar', length: 32, collation: 'C' })
  shortCode!: string;

  @Column({ name: 'long_url', type: 'text' })
  longUrl!: string;

  /** `null` means the link was created anonymously and cannot be managed. */
  @Column({ name: 'owner_id', type: 'varchar', length: 64, nullable: true })
  ownerId!: string | null;

  @Column({ type: 'varchar', length: 16, default: StoredLinkStatus.Active })
  status!: StoredLinkStatus;

  /** `null` means the link never expires. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  /** Rolled up by the analytics consumer. A 64-bit count, so a string. */
  @Column({ name: 'click_count', type: 'bigint', default: 0 })
  clickCount!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
