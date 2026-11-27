import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  updateProfileRequestSchema,
  type Identity,
  type SessionList,
  type UpdateProfileRequest,
} from '@url-shortener/contracts/identity';
import type { Request, Response } from 'express';
import { IdentityReader } from './account/identity-reader.js';
import { ProfileService } from './account/profile.service.js';
import { AuthGuard } from './auth.guard.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import type { Principal } from './principal.js';
import { requireUserSession } from './require-user-session.js';
import { CurrentSessionId } from './sessions/current-session.js';
import { SessionCookie } from './sessions/session-cookie.js';
import { uuidParam } from './uuid-param.js';

@Controller('api/v1/me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly identityReader: IdentityReader,
    private readonly profile: ProfileService,
    private readonly cookie: SessionCookie,
  ) {}

  @Get()
  describe(@CurrentPrincipal() principal: Principal): Promise<Identity> {
    return this.identityReader.describe(principal);
  }

  @Patch()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Body({ schema: updateProfileRequestSchema }) body: UpdateProfileRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Identity> {
    const userId = requireUserSession(principal);
    const reissued = await this.profile.update(
      userId,
      body,
      request.get('user-agent'),
    );
    if (reissued !== null) {
      this.cookie.set(response, reissued.token, reissued.session.expiresAt);
    }
    return this.identityReader.describeUser(userId);
  }

  @Get('sessions')
  listSessions(
    @CurrentPrincipal() principal: Principal,
    @CurrentSessionId() sessionId: string | null,
  ): Promise<SessionList> {
    return this.profile.listSessions(requireUserSession(principal), sessionId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentPrincipal() principal: Principal,
    @CurrentSessionId() currentSessionId: string | null,
    @Param('sessionId', uuidParam) sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.profile.revokeSession(requireUserSession(principal), sessionId);
    if (sessionId === currentSessionId) {
      this.cookie.clear(response);
    }
  }
}
