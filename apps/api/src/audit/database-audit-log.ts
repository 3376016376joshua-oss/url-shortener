import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditLogEntry } from '../database/entities/audit-log-entry.entity.js';
import { AuditLog, type AuditEntry } from './audit-log.js';

/** Appends audit entries to the `audit_log` table (PRD section 6). */
@Injectable()
export class DatabaseAuditLog extends AuditLog {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    await (manager ?? this.dataSource.manager)
      .getRepository(AuditLogEntry)
      .save({
        workspaceId: entry.workspaceId,
        actorType: entry.actor.type,
        actorId: entry.actor.id,
        action: entry.action,
        targetType: entry.target.type,
        targetId: entry.target.id,
        metadata: entry.metadata ?? {},
      });
  }
}
