import { Global, Module } from '@nestjs/common';
import { AuditLog } from './audit-log.js';
import { NoopAuditLog } from './noop-audit-log.js';

/** The audit trail (PRD section 6). Built by the identity workstream. */
@Global()
@Module({
  providers: [{ provide: AuditLog, useClass: NoopAuditLog }],
  exports: [AuditLog],
})
export class AuditModule {}
