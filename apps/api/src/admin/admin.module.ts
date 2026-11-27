import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';
import { AdminDomainsService } from './admin-domains.service.js';
import { AdminLinksService } from './admin-links.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminController } from './admin.controller.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

/** Platform admin actions: blocking links and domains, disabling accounts (PRD section 13). */
@Module({
  imports: [LinkCacheModule],
  controllers: [AdminController],
  providers: [
    AdminLinksService,
    AdminDomainsService,
    AdminUsersService,
    PlatformAdminGuard,
  ],
})
export class AdminModule {}
