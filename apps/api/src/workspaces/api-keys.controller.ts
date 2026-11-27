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
import {
  createApiKeyRequestSchema,
  type ApiKeyList,
  type CreateApiKeyRequest,
  type CreatedApiKey,
} from '@url-shortener/contracts/workspaces';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import { requireUserWithWorkspaceRole } from '../identity/require-user-session.js';
import { uuidParam } from '../identity/uuid-param.js';
import { ApiKeysService } from './api-keys.service.js';

@Controller('api/v1/workspaces/:workspaceId/api-keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
  ): Promise<ApiKeyList> {
    requireUserWithWorkspaceRole(principal, workspaceId, WorkspaceRole.Admin);
    return this.apiKeys.list(workspaceId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Body({ schema: createApiKeyRequestSchema }) body: CreateApiKeyRequest,
  ): Promise<CreatedApiKey> {
    const actor = requireUserWithWorkspaceRole(
      principal,
      workspaceId,
      WorkspaceRole.Admin,
    );
    return this.apiKeys.create(workspaceId, body, actor.userId);
  }

  @Delete(':apiKeyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Param('apiKeyId', uuidParam) apiKeyId: string,
  ): Promise<void> {
    const actor = requireUserWithWorkspaceRole(
      principal,
      workspaceId,
      WorkspaceRole.Admin,
    );
    return this.apiKeys.revoke(workspaceId, apiKeyId, actor.userId);
  }
}
