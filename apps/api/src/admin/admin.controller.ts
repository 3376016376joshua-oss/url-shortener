import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import {
  AdminDomainsService,
  type AdminDomainView,
} from './admin-domains.service.js';
import {
  AdminLinksService,
  type AdminLinkView,
} from './admin-links.service.js';
import {
  AdminUsersService,
  type AdminUserView,
} from './admin-users.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

const id = { schema: z.uuid() };

/** Takedown actions for the platform's operator (PRD sections 13 and 14). */
@Controller('api/v1/admin')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly links: AdminLinksService,
    private readonly domains: AdminDomainsService,
    private readonly users: AdminUsersService,
  ) {}

  @Post('links/:linkId/block')
  @HttpCode(HttpStatus.OK)
  blockLink(
    @CurrentPrincipal() admin: Principal,
    @Param('linkId', id) linkId: string,
  ): Promise<AdminLinkView> {
    return this.links.block(admin, linkId);
  }

  @Post('links/:linkId/unblock')
  @HttpCode(HttpStatus.OK)
  unblockLink(
    @CurrentPrincipal() admin: Principal,
    @Param('linkId', id) linkId: string,
  ): Promise<AdminLinkView> {
    return this.links.unblock(admin, linkId);
  }

  @Post('domains/:domainId/block')
  @HttpCode(HttpStatus.OK)
  blockDomain(
    @CurrentPrincipal() admin: Principal,
    @Param('domainId', id) domainId: string,
  ): Promise<AdminDomainView> {
    return this.domains.block(admin, domainId);
  }

  @Post('domains/:domainId/unblock')
  @HttpCode(HttpStatus.OK)
  unblockDomain(
    @CurrentPrincipal() admin: Principal,
    @Param('domainId', id) domainId: string,
  ): Promise<AdminDomainView> {
    return this.domains.unblock(admin, domainId);
  }

  @Post('users/:userId/disable')
  @HttpCode(HttpStatus.OK)
  disableUser(
    @CurrentPrincipal() admin: Principal,
    @Param('userId', id) userId: string,
  ): Promise<AdminUserView> {
    return this.users.disable(admin, userId);
  }

  @Post('users/:userId/enable')
  @HttpCode(HttpStatus.OK)
  enableUser(
    @CurrentPrincipal() admin: Principal,
    @Param('userId', id) userId: string,
  ): Promise<AdminUserView> {
    return this.users.enable(admin, userId);
  }
}
