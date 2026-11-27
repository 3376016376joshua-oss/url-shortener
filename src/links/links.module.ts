import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';

/** Create and manage API under /api/v1/urls. Built by the write-path workstream. */
@Module({
  imports: [LinkCacheModule],
})
export class LinksModule {}
