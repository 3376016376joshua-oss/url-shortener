import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export const ClickSource = {
  /** The short link was followed directly. */
  Link: 'link',
  /** The link's QR code was scanned. */
  Qr: 'qr',
} as const;
export type ClickSource = (typeof ClickSource)[keyof typeof ClickSource];

export const DeviceType = {
  Desktop: 'desktop',
  Mobile: 'mobile',
  Tablet: 'tablet',
  Bot: 'bot',
  Other: 'other',
} as const;
export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

/** The country code recorded when the visitor's country is not known. */
export const UNKNOWN_COUNTRY = 'ZZ';

/**
 * One click, after enrichment. Holds nothing that identifies the visitor: no
 * IP address, no visitor hash, no full referrer, no raw user agent.
 *
 * The table is partitioned by day on `clicked_at`, which is why the
 * timestamp is part of the primary key, and it deliberately has no foreign
 * key to `links`: events outlive nothing and are removed by dropping
 * partitions, not by cascading deletes.
 */
@Entity({ name: 'click_events' })
@Index('idx_click_events_link_id_clicked_at', ['linkId', 'clickedAt'])
@Check('ck_click_events_source', `"source" IN ('link', 'qr')`)
@Check(
  'ck_click_events_device_type',
  `"device_type" IN ('desktop', 'mobile', 'tablet', 'bot', 'other')`,
)
export class ClickEvent {
  /** Assigned by the producer; makes at-least-once delivery idempotent. */
  @PrimaryColumn({
    name: 'event_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_click_events',
  })
  eventId!: string;

  /** When the redirect happened, not when the row was written. */
  @PrimaryColumn({
    name: 'clicked_at',
    type: 'timestamptz',
    primaryKeyConstraintName: 'pk_click_events',
  })
  clickedAt!: Date;

  @Column({ name: 'link_id', type: 'uuid' })
  linkId!: string;

  /** The A/B variant served, or `null` for the control. */
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId!: string | null;

  @Column({ type: 'varchar', length: 8 })
  source!: ClickSource;

  /** ISO 3166-1 alpha-2, or `ZZ` when unknown. */
  @Column({ type: 'char', length: 2 })
  country!: string;

  @Column({ name: 'device_type', type: 'varchar', length: 8 })
  deviceType!: DeviceType;

  @Column({ type: 'varchar', length: 32 })
  os!: string;

  @Column({ type: 'varchar', length: 32 })
  browser!: string;

  /** Host of the Referer header only; `null` for a direct visit. */
  @Column({
    name: 'referrer_host',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  referrerHost!: string | null;
}
