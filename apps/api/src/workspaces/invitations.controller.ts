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
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  type AcceptInvitationRequest,
  type CreateInvitationRequest,
  type Invitation,
  type InvitationList,
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
import { InvitationAcceptanceService } from './invitation-acceptance.service.js';
import { InvitationsService } from './invitations.service.js';

@Controller('api/v1')
@UseGuards(AuthGuard)
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly acceptance: InvitationAcceptanceService,
  ) {}

  @Get('workspaces/:workspaceId/invitations')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
  ): Promise<InvitationList> {
    requireUserWithWorkspaceRole(principal, workspaceId, WorkspaceRole.Admin);
    return this.invitations.list(workspaceId);
  }

  @Post('workspaces/:workspaceId/invitations')
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Body({ schema: createInvitationRequestSchema })
    body: CreateInvitationRequest,
  ): Promise<Invitation> {
    const actor = requireUserWithWorkspaceRole(
      principal,
      workspaceId,
      WorkspaceRole.Admin,
    );
    return this.invitations.create(workspaceId, body, actor.userId);
  }

  @Delete('workspaces/:workspaceId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Param('invitationId', uuidParam) invitationId: string,
  ): Promise<void> {
    const actor = requireUserWithWorkspaceRole(
      principal,
      workspaceId,
      WorkspaceRole.Admin,
    );
    return this.invitations.revoke(workspaceId, invitationId, actor.userId);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentPrincipal() principal: Principal,
    @Body({ schema: acceptInvitationRequestSchema })
    body: AcceptInvitationRequest,
  ): Promise<WorkspaceDetails> {
    return this.acceptance.accept(body.token, requireUserSession(principal));
  }
}
