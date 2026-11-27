import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';

/** Workspaces, members, invitations, and API keys (PRD section 6). Built by the identity workstream. */
@Module({
  imports: [LinkCacheModule],
})
export class WorkspacesModule {}
