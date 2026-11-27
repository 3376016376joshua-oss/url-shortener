import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { ExperimentsModule } from '../experiments/experiments.module.js';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';

/** The redirect, GET /:code on any domain (PRD section 7). Built by the redirect workstream. */
@Module({
  imports: [LinkCacheModule, AnalyticsModule, ExperimentsModule],
})
export class RedirectModule {}
