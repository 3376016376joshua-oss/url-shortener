import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  linkAnalyticsParamsSchema,
  linkAnalyticsQuerySchema,
  workspaceAnalyticsParamsSchema,
  workspaceAnalyticsQuerySchema,
  type LinkAnalytics,
  type LinkAnalyticsParams,
  type LinkAnalyticsQuery,
  type WorkspaceAnalytics,
  type WorkspaceAnalyticsParams,
  type WorkspaceAnalyticsQuery,
} from '@url-shortener/contracts/analytics';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../../identity/auth.guard.js';
import { CurrentPrincipal } from '../../identity/current-principal.decorator.js';
import type { Principal } from '../../identity/principal.js';
import { requireWorkspaceRole } from '../../identity/workspace-access.js';
import { AnalyticsQueryService } from './analytics-query.service.js';

@Controller('api/v1/workspaces/:workspaceId')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsQueryService) {}

  @Get('links/:linkId/analytics')
  linkAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Param({ schema: linkAnalyticsParamsSchema }) params: LinkAnalyticsParams,
    @Query({ schema: linkAnalyticsQuerySchema }) query: LinkAnalyticsQuery,
  ): Promise<LinkAnalytics> {
    requireWorkspaceRole(principal, params.workspaceId, WorkspaceRole.Member);
    return this.analytics.linkAnalytics(
      params.workspaceId,
      params.linkId,
      query,
    );
  }

  @Get('analytics')
  workspaceAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Param({ schema: workspaceAnalyticsParamsSchema })
    params: WorkspaceAnalyticsParams,
    @Query({ schema: workspaceAnalyticsQuerySchema })
    query: WorkspaceAnalyticsQuery,
  ): Promise<WorkspaceAnalytics> {
    requireWorkspaceRole(principal, params.workspaceId, WorkspaceRole.Member);
    return this.analytics.workspaceAnalytics(params.workspaceId, query);
  }
}
