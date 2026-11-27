import { Module } from '@nestjs/common';
import { LinkCacheInvalidator } from './link-cache-invalidator.js';
import { NoopLinkCacheInvalidator } from './noop-link-cache-invalidator.js';

/** Redis cache-aside for redirect lookups (PRD section 7). Built by the redirect workstream. */
@Module({
  providers: [
    { provide: LinkCacheInvalidator, useClass: NoopLinkCacheInvalidator },
  ],
  exports: [LinkCacheInvalidator],
})
export class LinkCacheModule {}
