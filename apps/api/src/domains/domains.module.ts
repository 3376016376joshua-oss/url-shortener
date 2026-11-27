import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { LinkCacheModule } from '../link-cache/link-cache.module.js';
import { Clock, SystemClock } from './clock.js';
import { DnsResolver } from './dns-resolver.js';
import { DomainDnsChecker } from './domain-dns-checker.js';
import { DomainVerificationJob } from './domain-verification.job.js';
import { DomainVerificationService } from './domain-verification.service.js';
import { DomainsController } from './domains.controller.js';
import { DomainsService } from './domains.service.js';
import { NodeDnsResolver } from './node-dns-resolver.js';
import { PlatformDomainSeeder } from './platform-domain.seeder.js';
import { PlatformHosts } from './platform-hosts.js';
import { TlsAuthorizationController } from './tls-authorization.controller.js';
import { TlsAuthorizationService } from './tls-authorization.service.js';

/** Custom domains: claims, DNS verification, and the TLS authorisation endpoint (PRD section 8). */
@Module({
  imports: [LinkCacheModule],
  controllers: [DomainsController, TlsAuthorizationController],
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: DnsResolver, useClass: NodeDnsResolver },
    {
      provide: PlatformHosts,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        PlatformHosts.fromEnv({
          APP_URL: config.get('APP_URL', { infer: true }),
          DEFAULT_SHORT_DOMAIN: config.get('DEFAULT_SHORT_DOMAIN', {
            infer: true,
          }),
          CNAME_TARGET: config.get('CNAME_TARGET', { infer: true }),
        }),
    },
    DomainDnsChecker,
    DomainVerificationService,
    DomainVerificationJob,
    DomainsService,
    TlsAuthorizationService,
    PlatformDomainSeeder,
  ],
})
export class DomainsModule {}
