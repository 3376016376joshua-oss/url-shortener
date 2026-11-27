import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import { PlatformHosts } from './platform-hosts.js';

/**
 * Decides whether the edge may obtain a certificate for a host. Without it,
 * anyone could point a name at the platform and have it request certificates
 * until the certificate authority's rate limit shut the platform out.
 */
@Injectable()
export class TlsAuthorizationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly platformHosts: PlatformHosts,
  ) {}

  /**
   * Asked once per certificate rather than once per request, so it reads
   * Postgres directly and never a cache that could be stale.
   */
  async isAuthorized(host: string): Promise<boolean> {
    const hostname = host.toLowerCase();
    if (this.platformHosts.includes(hostname)) {
      return true;
    }
    return this.dataSource
      .getRepository(Domain)
      .existsBy({ hostname, status: DomainStatus.Active });
  }
}
