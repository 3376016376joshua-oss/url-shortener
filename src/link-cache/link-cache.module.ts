import { Module } from '@nestjs/common';
import { LinkCacheInvalidator } from './link-cache-invalidator.js';
import { NoopLinkCacheInvalidator } from './noop-link-cache-invalidator.js';

/** Redis cache-aside for link lookups (PRD section 9). Built by the read path. */
@Module({
  providers: [
    { provide: LinkCacheInvalidator, useClass: NoopLinkCacheInvalidator },
  ],
  exports: [LinkCacheInvalidator],
})
export class LinkCacheModule {}
