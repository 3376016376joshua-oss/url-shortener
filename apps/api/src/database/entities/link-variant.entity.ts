import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { UuidPrimaryColumn } from '../columns.js';
import { Link } from './link.entity.js';

/**
 * An alternative destination in an A/B test. Its weight is the percentage of
 * traffic it receives; the link's own destination (the control) gets the rest.
 */
@Entity({ name: 'link_variants' })
@Index('idx_link_variants_link_id', ['linkId'])
@Check(
  'ck_link_variants_destination_url_length',
  'char_length("destination_url") <= 2048',
)
@Check('ck_link_variants_weight', '"weight" BETWEEN 1 AND 99')
export class LinkVariant {
  @UuidPrimaryColumn('pk_link_variants')
  id!: string;

  @Column({ name: 'link_id', type: 'uuid' })
  @ForeignKey(() => Link, {
    name: 'fk_link_variants_link_id',
    onDelete: 'CASCADE',
  })
  linkId!: string;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Column({ name: 'destination_url', type: 'text' })
  destinationUrl!: string;

  @Column({ type: 'smallint' })
  weight!: number;

  /** An archived variant gets no traffic but keeps its name for past stats. */
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
