import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  Unique,
} from 'typeorm';
import { UuidPrimaryColumn } from '../columns.js';
import { User } from './user.entity.js';

export const EmailTokenPurpose = {
  VerifyEmail: 'verify_email',
  ResetPassword: 'reset_password',
} as const;
export type EmailTokenPurpose =
  (typeof EmailTokenPurpose)[keyof typeof EmailTokenPurpose];

/** A single-use token mailed to a user to prove they control an address. */
@Entity({ name: 'email_tokens' })
@Unique('uq_email_tokens_token_hash', ['tokenHash'])
@Index('idx_email_tokens_user_id', ['userId'])
@Check(
  'ck_email_tokens_purpose',
  `"purpose" IN ('verify_email', 'reset_password')`,
)
export class EmailToken {
  @UuidPrimaryColumn('pk_email_tokens')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey(() => User, {
    name: 'fk_email_tokens_user_id',
    onDelete: 'CASCADE',
  })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  purpose!: EmailTokenPurpose;

  @Column({ name: 'token_hash', type: 'bytea' })
  tokenHash!: Buffer;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
