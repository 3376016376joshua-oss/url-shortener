import {
  Column,
  CreateDateColumn,
  Entity,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UuidPrimaryColumn } from '../columns.js';

/** The tenant: links, domains, and API keys all belong to a workspace. */
@Entity({ name: 'workspaces' })
@Unique('uq_workspaces_slug', ['slug'])
export class Workspace {
  @UuidPrimaryColumn('pk_workspaces')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 48, collation: 'C' })
  slug!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
