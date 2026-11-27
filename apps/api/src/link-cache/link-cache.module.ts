import { Module } from '@nestjs/common';
import { LinkCacheInvalidator } from './link-cache-invalidator.js';
import { LinkCache } from './link-cache.js';
import { RedisLinkCacheInvalidator } from './redis-link-cache-invalidator.js';

/** Redis cache-aside for redirect lookups (PRD section 7). */
@Module({
  providers: [
    LinkCache,
    { provide: LinkCacheInvalidator, useClass: RedisLinkCacheInvalidator },
  ],
  exports: [LinkCache, LinkCacheInvalidator],
})
export class LinkCacheModule {}
