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
  UseGuards,
} from '@nestjs/common';
import {
  createWorkspaceRequestSchema,
  updateWorkspaceRequestSchema,
  type CreateWorkspaceRequest,
  type UpdateWorkspaceRequest,
  type WorkspaceDetails,
} from '@url-shortener/contracts/workspaces';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import {
  requireUserSession,
  requireUserWithWorkspaceRole,
} from '../identity/require-user-session.js';
import { uuidParam } from '../identity/uuid-param.js';
import { requireWorkspaceRole } from '../identity/workspace-access.js';
import { WorkspaceDeletionService } from './workspace-deletion.service.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('api/v1/workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly deletion: WorkspaceDeletionService,
  ) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body({ schema: createWorkspaceRequestSchema })
    body: CreateWorkspaceRequest,
  ): Promise<WorkspaceDetails> {
    return this.workspaces.create(requireUserSession(principal), body.name);
  }

  @Get(':workspaceId')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
  ): Promise<WorkspaceDetails> {
    const role = requireWorkspaceRole(
      principal,
      workspaceId,
      WorkspaceRole.Member,
    );
    return this.workspaces.get(workspaceId, role);
  }

  @Patch(':workspaceId')
  rename(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Body({ schema: updateWorkspaceRequestSchema })
    body: UpdateWorkspaceRequest,
  ): Promise<WorkspaceDetails> {
    requireUserWithWorkspaceRole(principal, workspaceId, WorkspaceRole.Owner);
    return this.workspaces.rename(workspaceId, body.name, principal);
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
  ): Promise<void> {
    requireUserWithWorkspaceRole(principal, workspaceId, WorkspaceRole.Owner);
    return this.deletion.delete(workspaceId, principal);
  }
}
