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

@Entity({ name: 'sessions' })
@Unique('uq_sessions_token_hash', ['tokenHash'])
@Index('idx_sessions_user_id', ['userId'])
export class Session {
  @UuidPrimaryColumn('pk_sessions')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey(() => User, { name: 'fk_sessions_user_id', onDelete: 'CASCADE' })
  userId!: string;

  /** SHA-256 of the session token. The token itself is never stored. */
  @Column({ name: 'token_hash', type: 'bytea' })
  tokenHash!: Buffer;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
