import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * The random salt mixed into visitor hashes on one UTC day. A new one is
 * drawn every day and old ones are deleted, so a hash cannot be reversed or
 * compared across days.
 */
@Entity({ name: 'visitor_salts' })
export class VisitorSalt {
  @PrimaryColumn({ type: 'date', primaryKeyConstraintName: 'pk_visitor_salts' })
  day!: string;

  @Column({ type: 'bytea' })
  salt!: Buffer;
}
