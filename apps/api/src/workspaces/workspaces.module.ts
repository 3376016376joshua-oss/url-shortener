import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';
import { InvitationAcceptanceService } from './invitation-acceptance.service.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { WorkspaceDeletionService } from './workspace-deletion.service.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

/** Workspaces, members, invitations, and API keys (PRD section 6). */
@Module({
  imports: [LinkCacheModule],
  controllers: [
    WorkspacesController,
    MembersController,
    InvitationsController,
    ApiKeysController,
  ],
  providers: [
    WorkspacesService,
    WorkspaceDeletionService,
    MembersService,
    InvitationsService,
    InvitationAcceptanceService,
    ApiKeysService,
  ],
})
export class WorkspacesModule {}
