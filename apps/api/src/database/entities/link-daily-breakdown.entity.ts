import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import { Link } from './link.entity.js';

export const BreakdownDimension = {
  Country: 'country',
  Device: 'device',
  Os: 'os',
  Browser: 'browser',
  Referrer: 'referrer',
  Source: 'source',
  Variant: 'variant',
} as const;
export type BreakdownDimension =
  (typeof BreakdownDimension)[keyof typeof BreakdownDimension];

/**
 * Clicks of one link on one UTC day, split along one dimension. One row per
 * value seen, for example (`country`, `DE`) or (`device`, `mobile`).
 */
@Entity({ name: 'link_daily_breakdowns' })
@Check(
  'ck_link_daily_breakdowns_dimension',
  `"dimension" IN ('country', 'device', 'os', 'browser', 'referrer', 'source', 'variant')`,
)
export class LinkDailyBreakdown {
  @PrimaryColumn({
    name: 'link_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_link_daily_breakdowns',
  })
  @ForeignKey(() => Link, {
    name: 'fk_link_daily_breakdowns_link_id',
    onDelete: 'CASCADE',
  })
  linkId!: string;

  @PrimaryColumn({
    type: 'date',
    primaryKeyConstraintName: 'pk_link_daily_breakdowns',
  })
  day!: string;

  @PrimaryColumn({
    type: 'varchar',
    length: 16,
    primaryKeyConstraintName: 'pk_link_daily_breakdowns',
  })
  dimension!: BreakdownDimension;

  @PrimaryColumn({
    type: 'varchar',
    length: 255,
    primaryKeyConstraintName: 'pk_link_daily_breakdowns',
  })
  value!: string;

  @Column({ type: 'bigint', default: 0 })
  clicks!: string;
}
