import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { DataSource } from 'typeorm';
import { ApiException } from '../common/errors/api-exception.js';
import { Domain, DomainStatus } from '../database/entities/domain.entity.js';
import {
  DestinationRisk,
  assessDestination,
  destinationHost,
  type DestinationPolicy,
} from './destination-policy.js';
import { DESTINATION_POLICY } from './destination-policy.provider.js';

const REFUSALS: Readonly<Record<DestinationRisk, string>> = {
  [DestinationRisk.BlockedHost]: 'This destination is not allowed',
  [DestinationRisk.PlatformHost]:
    'A destination cannot be a host of this platform',
  [DestinationRisk.LocalAddress]:
    'A destination cannot be a local or private address',
};

/** The destination risk check of PRD section 13, for links and variants. */
@Injectable()
export class DestinationRiskCheck {
  constructor(
    @Inject(DESTINATION_POLICY) private readonly policy: DestinationPolicy,
    private readonly dataSource: DataSource,
  ) {}

  /** Fails the request with 422 unless the destination may be linked to. */
  async assertAllowed(destinationUrl: string): Promise<void> {
    const risk =
      assessDestination(destinationUrl, this.policy) ??
      (await this.shortDomainRisk(destinationUrl));
    if (risk !== null) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.DestinationBlocked,
        REFUSALS[risk],
      );
    }
  }

  /**
   * Only a serving domain counts. A pending claim does not, or anyone could
   * make a host unlinkable for everybody by claiming it.
   */
  private async shortDomainRisk(
    destinationUrl: string,
  ): Promise<DestinationRisk | null> {
    const isShortDomain = await this.dataSource.getRepository(Domain).existsBy({
      hostname: destinationHost(destinationUrl),
      status: DomainStatus.Active,
    });
    return isShortDomain ? DestinationRisk.PlatformHost : null;
  }
}
