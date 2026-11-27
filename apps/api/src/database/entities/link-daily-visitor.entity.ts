import { Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { Link } from './link.entity.js';

/**
 * The visitors already counted for a link today, so each is counted once.
 * Rows are deleted two days later, together with the salt that produced the
 * hash, after which nothing can be linked back to a visitor.
 */
@Entity({ name: 'link_daily_visitors' })
export class LinkDailyVisitor {
  @PrimaryColumn({
    name: 'link_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_link_daily_visitors',
  })
  @ForeignKey(() => Link, {
    name: 'fk_link_daily_visitors_link_id',
    onDelete: 'CASCADE',
  })
  linkId!: string;

  @PrimaryColumn({
    type: 'date',
    primaryKeyConstraintName: 'pk_link_daily_visitors',
  })
  day!: string;

  @PrimaryColumn({
    name: 'visitor_hash',
    type: 'bytea',
    primaryKeyConstraintName: 'pk_link_daily_visitors',
  })
  visitorHash!: Buffer;
}
