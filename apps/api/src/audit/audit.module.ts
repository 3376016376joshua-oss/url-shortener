import { Global, Module } from '@nestjs/common';
import { AuditLogReader } from './audit-log-reader.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLog } from './audit-log.js';
import { DatabaseAuditLog } from './database-audit-log.js';

/** The audit trail (PRD section 6): written by every module, read by admins. */
@Global()
@Module({
  controllers: [AuditLogController],
  providers: [
    { provide: AuditLog, useClass: DatabaseAuditLog },
    AuditLogReader,
  ],
  exports: [AuditLog],
})
export class AuditModule {}
