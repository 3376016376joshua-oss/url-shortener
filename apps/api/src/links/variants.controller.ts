import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createVariantRequestSchema,
  updateVariantRequestSchema,
  type CreateVariantRequest,
  type LinkResponse,
  type UpdateVariantRequest,
  type VariantListResponse,
  type VariantResponse,
} from '@url-shortener/contracts/links';
import { z } from 'zod';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import { requireWorkspaceRole } from '../identity/workspace-access.js';
import { UUID_PARAM } from './route-params.js';
import { VariantsService, type VariantRef } from './variants.service.js';

const VARIANT_REF = {
  schema: z.object({
    workspaceId: z.uuid(),
    linkId: z.uuid(),
    variantId: z.uuid(),
  }),
};

@Controller('api/v1/workspaces/:workspaceId/links/:linkId/variants')
@UseGuards(AuthGuard)
export class VariantsController {
  constructor(private readonly variants: VariantsService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', UUID_PARAM) workspaceId: string,
    @Param('linkId', UUID_PARAM) linkId: string,
  ): Promise<VariantListResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.variants.list(workspaceId, linkId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', UUID_PARAM) workspaceId: string,
    @Param('linkId', UUID_PARAM) linkId: string,
    @Body({ schema: createVariantRequestSchema }) body: CreateVariantRequest,
  ): Promise<VariantResponse> {
    requireWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.variants.create(workspaceId, linkId, body, principal);
  }

  @Patch(':variantId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param(VARIANT_REF) ref: VariantRef,
    @Body({ schema: updateVariantRequestSchema }) body: UpdateVariantRequest,
  ): Promise<VariantResponse> {
    requireWorkspaceRole(principal, ref.workspaceId, WorkspaceRole.Member);
    return this.variants.update(ref, body, principal);
  }

  @Post(':variantId/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentPrincipal() principal: Principal,
    @Param(VARIANT_REF) ref: VariantRef,
  ): Promise<VariantResponse> {
    requireWorkspaceRole(principal, ref.workspaceId, WorkspaceRole.Member);
    return this.variants.archive(ref, principal);
  }

  @Post(':variantId/promote')
  @HttpCode(HttpStatus.OK)
  promote(
    @CurrentPrincipal() principal: Principal,
    @Param(VARIANT_REF) ref: VariantRef,
  ): Promise<LinkResponse> {
    requireWorkspaceRole(principal, ref.workspaceId, WorkspaceRole.Member);
    return this.variants.promote(ref, principal);
  }
}
