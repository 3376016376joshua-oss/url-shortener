import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DNS_CHALLENGE_LABEL } from '@url-shortener/contracts/domains';
import type { Env } from '../config/env.schema.js';
import { DnsResolver } from './dns-resolver.js';

/** What one look at a domain's DNS found, one answer per record asked for. */
export interface DomainCheckResult {
  /** The TXT record carries the claim's token. */
  ownershipVerified: boolean;
  /** The host resolves to the platform. */
  routingVerified: boolean;
}

/** DNS answers are case-insensitive and may carry the root's trailing dot. */
function normaliseHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

/**
 * The two DNS checks of PRD section 8. DNS only: it never connects to the
 * host being checked, so it cannot be used to probe internal networks.
 */
@Injectable()
export class DomainDnsChecker {
  private readonly cnameTarget: string;

  constructor(
    private readonly resolver: DnsResolver,
    config: ConfigService<Env, true>,
  ) {
    this.cnameTarget = config.get('CNAME_TARGET', { infer: true });
  }

  /** Rejects with `DnsLookupError` when DNS could not be asked. */
  async check(
    hostname: string,
    verificationToken: string,
  ): Promise<DomainCheckResult> {
    const [ownershipVerified, routingVerified] = await Promise.all([
      this.publishesToken(hostname, verificationToken),
      this.resolvesToPlatform(hostname),
    ]);
    return { ownershipVerified, routingVerified };
  }

  private async publishesToken(
    hostname: string,
    verificationToken: string,
  ): Promise<boolean> {
    const values = await this.resolver.resolveTxt(
      `${DNS_CHALLENGE_LABEL}.${hostname}`,
    );
    return values.some((value) => value.trim() === verificationToken);
  }

  /**
   * A CNAME to the target passes. So do addresses that are all among the
   * target's, which is how an apex domain (ALIAS, ANAME, flattened CNAME, or
   * plain A/AAAA records) points at the platform.
   */
  private async resolvesToPlatform(hostname: string): Promise<boolean> {
    const aliases = await this.resolver.resolveCname(hostname);
    if (aliases.map(normaliseHost).includes(this.cnameTarget)) {
      return true;
    }
    const [addresses, targetAddresses] = await Promise.all([
      this.resolver.resolveAddresses(hostname),
      this.resolver.resolveAddresses(this.cnameTarget),
    ]);
    const platform = new Set(targetAddresses);
    return (
      addresses.length > 0 &&
      addresses.every((address) => platform.has(address))
    );
  }
}
