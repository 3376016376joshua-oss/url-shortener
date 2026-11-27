import { Injectable } from '@nestjs/common';
import { AuditLog } from './audit-log.js';

/** Placeholder until the identity workstream ships the audit log. */
@Injectable()
export class NoopAuditLog extends AuditLog {
  record(): Promise<void> {
    return Promise.resolve();
  }
}
