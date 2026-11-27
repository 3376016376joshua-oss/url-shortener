import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';

/** Platform admin actions: blocking links, domains, and users (PRD section 13). Built by the platform workstream. */
@Module({
  imports: [LinkCacheModule],
})
export class AdminModule {}
