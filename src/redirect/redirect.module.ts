import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';

/** The redirect, GET /:code. Built by the read-path workstream. */
@Module({
  imports: [LinkCacheModule, AnalyticsModule],
})
export class RedirectModule {}
