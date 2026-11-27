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
import { UuidPrimaryColumn } from '../columns.js';
import { Workspace } from './workspace.entity.js';

export const DomainStatus = {
  /** Added, waiting for its DNS records to be verified. */
  Pending: 'PENDING',
  /** Verified and serving redirects. */
  Active: 'ACTIVE',
  /** Verification failed, or DNS stopped pointing at the platform. */
  Inactive: 'INACTIVE',
  /** Taken down by a platform admin. */
  Blocked: 'BLOCKED',
} as const;
export type DomainStatus = (typeof DomainStatus)[keyof typeof DomainStatus];

/**
 * The index that lets only one row serve a host. Several workspaces may hold
 * an unverified claim to the same host; verifying one is what makes it theirs.
 */
export const SERVING_HOSTNAME_UNIQUE_INDEX = 'uq_domains_serving_hostname';

/** A host that serves short links. Each domain is its own code namespace. */
@Entity({ name: 'domains' })
@Unique('uq_domains_workspace_id_hostname', ['workspaceId', 'hostname'])
@Index(SERVING_HOSTNAME_UNIQUE_INDEX, ['hostname'], {
  unique: true,
  where: `"status" IN ('ACTIVE', 'BLOCKED')`,
})
@Check('ck_domains_hostname_lowercase', '"hostname" = lower("hostname")')
@Check(
  'ck_domains_status',
  `"status" IN ('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED')`,
)
export class Domain {
  @UuidPrimaryColumn('pk_domains')
  id!: string;

  /** `null` for a platform domain, which every workspace may use. */
  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  @ForeignKey(() => Workspace, {
    name: 'fk_domains_workspace_id',
    onDelete: 'CASCADE',
  })
  workspaceId!: string | null;

  @Column({ type: 'varchar', length: 253, collation: 'C' })
  hostname!: string;

  @Column({ type: 'varchar', length: 16, default: DomainStatus.Pending })
  status!: DomainStatus;

  /** The value the owner publishes in a TXT record to prove ownership. */
  @Column({ name: 'verification_token', type: 'varchar', length: 64 })
  verificationToken!: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt!: Date | null;

  /** Consecutive failed checks; an active domain is deactivated at three. */
  @Column({ name: 'failed_checks', type: 'smallint', default: 0 })
  failedChecks!: number;

  /** Result of the last check of the TXT record that proves ownership. */
  @Column({ name: 'ownership_verified', type: 'boolean', default: false })
  ownershipVerified!: boolean;

  /** Result of the last check that the host resolves to the platform. */
  @Column({ name: 'routing_verified', type: 'boolean', default: false })
  routingVerified!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
