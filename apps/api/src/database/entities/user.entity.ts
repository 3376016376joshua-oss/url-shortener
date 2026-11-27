import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UuidPrimaryColumn } from '../columns.js';

@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Check('ck_users_email_lowercase', '"email" = lower("email")')
export class User {
  @UuidPrimaryColumn('pk_users')
  id!: string;

  /** Always stored lowercase, so uniqueness is case-insensitive. */
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'is_platform_admin', type: 'boolean', default: false })
  isPlatformAdmin!: boolean;

  /** Set by a platform admin; a disabled user cannot sign in. */
  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
