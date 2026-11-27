import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createLinkRequestSchema,
  listLinksQuerySchema,
  updateLinkRequestSchema,
  type CreateLinkRequest,
  type LinkListResponse,
  type LinkResponse,
  type ListLinksQuery,
  type UpdateLinkRequest,
} from '@url-shortener/contracts/links';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import { requireWorkspaceRole } from '../identity/workspace-access.js';
import { LinkCreationService } from './link-creation.service.js';
import { LinkListService } from './link-list.service.js';
import { LinksService } from './links.service.js';
import { UUID_PARAM } from './route-params.js';

@Controller('api/v1/workspaces/:workspaceId/links')
@UseGuards(AuthGuard)
export class LinksController {
  constructor(
    private readonly links: LinksService,
    private readonly creation: LinkCreationService,
    private readonly listing: LinkListService,
  ) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', UUID_PARAM) workspaceId: string,
    @Query({ schema: listLinksQuerySchema }) query: ListLinksQuery,
  ): Promise<LinkListResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.listing.list(workspaceId, query);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', UUID_PARAM) workspaceId: string,
    @Body({ schema: createLinkRequestSchema }) body: CreateLinkRequest,
  ): Promise<LinkResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.creation.create(workspaceId, body, principal);
  }

  @Get(':linkId')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', UUID_PARAM) workspaceId: string,
    @Param('linkId', UUID_PARAM) linkId: string,
  ): Promise<LinkResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.links.get(workspaceId, linkId);
  }

  @Patch(':linkId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', UUID_PARAM) workspaceId: string,
    @Param('linkId', UUID_PARAM) linkId: string,
    @Body({ schema: updateLinkRequestSchema }) body: UpdateLinkRequest,
  ): Promise<LinkResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.links.update(workspaceId, linkId, body, principal);
  }

  @Delete(':linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', UUID_PARAM) workspaceId: string,
    @Param('linkId', UUID_PARAM) linkId: string,
  ): Promise<void> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.links.delete(workspaceId, linkId, principal);
  }
}
