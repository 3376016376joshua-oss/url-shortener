import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  updateMemberRoleRequestSchema,
  type Member,
  type MemberList,
  type UpdateMemberRoleRequest,
} from '@url-shortener/contracts/workspaces';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import { requireUserWithWorkspaceRole } from '../identity/require-user-session.js';
import { uuidParam } from '../identity/uuid-param.js';
import { MembersService } from './members.service.js';

@Controller('api/v1/workspaces/:workspaceId/members')
@UseGuards(AuthGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
  ): Promise<MemberList> {
    requireUserWithWorkspaceRole(principal, workspaceId, WorkspaceRole.Member);
    return this.members.list(workspaceId);
  }

  @Patch(':userId')
  changeRole(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Param('userId', uuidParam) userId: string,
    @Body({ schema: updateMemberRoleRequestSchema })
    body: UpdateMemberRoleRequest,
  ): Promise<Member> {
    const actor = requireUserWithWorkspaceRole(
      principal,
      workspaceId,
      WorkspaceRole.Owner,
    );
    return this.members.changeRole(
      workspaceId,
      userId,
      body.role,
      actor.userId,
    );
  }

  /** Any member may call this to leave; the service decides the rest. */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', uuidParam) workspaceId: string,
    @Param('userId', uuidParam) userId: string,
  ): Promise<void> {
    const actor = requireUserWithWorkspaceRole(
      principal,
      workspaceId,
      WorkspaceRole.Member,
    );
    return this.members.remove(workspaceId, userId, actor);
  }
}
