import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UrlMapping } from './url-mapping.entity.js';

export const UserAgentClass = {
  Desktop: 'desktop',
  Mobile: 'mobile',
  Bot: 'bot',
  Other: 'other',
} as const;
export type UserAgentClass =
  (typeof UserAgentClass)[keyof typeof UserAgentClass];

@Entity({ name: 'click_events' })
@Index('idx_click_events_link_id_clicked_at', ['linkId', 'clickedAt'])
@Check(
  'ck_click_events_ua_class',
  `"ua_class" IN ('desktop', 'mobile', 'bot', 'other')`,
)
export class ClickEvent {
  /** Assigned by the producer; makes at-least-once delivery idempotent. */
  @PrimaryColumn({
    name: 'event_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_click_events',
  })
  eventId!: string;

  @Column({ name: 'link_id', type: 'bigint' })
  linkId!: string;

  @ManyToOne(() => UrlMapping, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'link_id',
    foreignKeyConstraintName: 'fk_click_events_link_id',
  })
  link?: UrlMapping;

  /** When the redirect happened, not when the row was written. */
  @Column({ name: 'clicked_at', type: 'timestamptz' })
  clickedAt!: Date;

  /** Host of the Referer header only; the full URL is never stored. */
  @Column({
    name: 'referrer_host',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  referrerHost!: string | null;

  @Column({ name: 'ua_class', type: 'varchar', length: 16 })
  uaClass!: UserAgentClass;
}
