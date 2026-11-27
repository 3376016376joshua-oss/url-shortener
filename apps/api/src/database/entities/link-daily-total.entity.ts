import { Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { Link } from './link.entity.js';

/** Clicks and unique visitors of one link on one UTC day. */
@Entity({ name: 'link_daily_totals' })
export class LinkDailyTotal {
  @PrimaryColumn({
    name: 'link_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_link_daily_totals',
  })
  @ForeignKey(() => Link, {
    name: 'fk_link_daily_totals_link_id',
    onDelete: 'CASCADE',
  })
  linkId!: string;

  /** A UTC calendar day, as `YYYY-MM-DD`. */
  @PrimaryColumn({
    type: 'date',
    primaryKeyConstraintName: 'pk_link_daily_totals',
  })
  day!: string;

  @Column({ type: 'bigint', default: 0 })
  clicks!: string;

  @Column({ name: 'unique_visitors', type: 'bigint', default: 0 })
  uniqueVisitors!: string;
}
