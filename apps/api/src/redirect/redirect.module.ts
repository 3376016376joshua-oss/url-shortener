import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { ExperimentsModule } from '../experiments/experiments.module.js';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';
import { Clock, SystemClock } from './clock.js';
import { LinkResolver } from './link-resolver.js';
import { RedirectLinkRepository } from './redirect-link.repository.js';
import { RedirectController } from './redirect.controller.js';
import { RedirectService } from './redirect.service.js';

/** The redirect, GET /:code on any domain (PRD section 7). */
@Module({
  imports: [LinkCacheModule, AnalyticsModule, ExperimentsModule],
  controllers: [RedirectController],
  providers: [
    RedirectService,
    LinkResolver,
    RedirectLinkRepository,
    { provide: Clock, useClass: SystemClock },
  ],
})
export class RedirectModule {}
