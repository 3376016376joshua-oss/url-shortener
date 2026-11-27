import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';

/** Link and variant management (PRD section 7). Built by the links workstream. */
@Module({
  imports: [LinkCacheModule],
})
export class LinksModule {}
