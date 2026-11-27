import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createDomainRequestSchema,
  workspaceDomainParamsSchema,
  workspaceDomainsParamsSchema,
  type CreateDomainRequest,
  type DomainListResponse,
  type DomainResponse,
  type WorkspaceDomainParams,
  type WorkspaceDomainsParams,
} from '@url-shortener/contracts/domains';
import type { Env } from '../config/env.schema.js';
import type { Domain } from '../database/entities/domain.entity.js';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import { requireWorkspaceRole } from '../identity/workspace-access.js';
import { toAuditActor } from './audit-actor.js';
import { toDomainResponse } from './domain.presenter.js';
import { DomainsService } from './domains.service.js';

/** Custom domains of a workspace (PRD section 14). */
@Controller('api/v1/workspaces/:workspaceId/domains')
@UseGuards(AuthGuard)
export class DomainsController {
  private readonly cnameTarget: string;

  constructor(
    private readonly domains: DomainsService,
    config: ConfigService<Env, true>,
  ) {
    this.cnameTarget = config.get('CNAME_TARGET', { infer: true });
  }

  @Get()
  async list(
    @Param({ schema: workspaceDomainsParamsSchema })
    { workspaceId }: WorkspaceDomainsParams,
    @CurrentPrincipal() principal: Principal,
  ): Promise<DomainListResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    const domains = await this.domains.list(workspaceId);
    return {
      items: domains.map((domain) => this.present(domain)),
      nextCursor: null,
    };
  }

  @Post()
  async create(
    @Param({ schema: workspaceDomainsParamsSchema })
    { workspaceId }: WorkspaceDomainsParams,
    @Body({ schema: createDomainRequestSchema }) body: CreateDomainRequest,
    @CurrentPrincipal() principal: Principal,
  ): Promise<DomainResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Admin);
    const domain = await this.domains.claim(
      workspaceId,
      body.hostname,
      toAuditActor(principal),
    );
    return this.present(domain);
  }

  @Get(':domainId')
  async get(
    @Param({ schema: workspaceDomainParamsSchema })
    { workspaceId, domainId }: WorkspaceDomainParams,
    @CurrentPrincipal() principal: Principal,
  ): Promise<DomainResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.present(await this.domains.get(workspaceId, domainId));
  }

  @Post(':domainId/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Param({ schema: workspaceDomainParamsSchema })
    { workspaceId, domainId }: WorkspaceDomainParams,
    @CurrentPrincipal() principal: Principal,
  ): Promise<DomainResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Admin);
    const domain = await this.domains.verifyNow(
      workspaceId,
      domainId,
      toAuditActor(principal),
    );
    return this.present(domain);
  }

  @Delete(':domainId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param({ schema: workspaceDomainParamsSchema })
    { workspaceId, domainId }: WorkspaceDomainParams,
    @CurrentPrincipal() principal: Principal,
  ): Promise<void> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Admin);
    await this.domains.remove(workspaceId, domainId, toAuditActor(principal));
  }

  private present(domain: Domain): DomainResponse {
    return toDomainResponse(domain, this.cnameTarget);
  }
}
