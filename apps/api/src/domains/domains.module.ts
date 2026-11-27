import { Module } from '@nestjs/common';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';

/** Custom domains: verification and the TLS authorisation endpoint (PRD section 8). Built by the domains workstream. */
@Module({
  imports: [LinkCacheModule],
})
export class DomainsModule {}
