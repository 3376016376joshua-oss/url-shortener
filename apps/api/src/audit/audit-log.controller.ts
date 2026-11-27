import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  auditLogQuerySchema,
  type AuditLogPage,
  type AuditLogQuery,
} from '@url-shortener/contracts/workspaces';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import { requireUserWithWorkspaceRole } from '../identity/require-user-session.js';
import { uuidParam } from '../identity/uuid-param.js';
import { AuditLogReader } from './audit-log-reader.js';

@Controller('api/v1/workspaces/:workspaceId/audit-log')
@UseGuards(AuthGuard)
export class AuditLogController {
  constructor(private readonly reader: AuditLogReader) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Query({ schema: auditLogQuerySchema }) query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    requireUserWithWorkspaceRole(principal, workspaceId, WorkspaceRole.Admin);
    return this.reader.readPage(workspaceId, query);
  }
}
