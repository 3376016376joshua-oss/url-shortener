import {
  DNS_CHALLENGE_LABEL,
  DnsRecordType,
  type DnsRecord,
  type DomainResponse,
} from '@url-shortener/contracts/domains';
import type { Domain } from '../database/entities/domain.entity.js';

function toDnsRecords(domain: Domain, cnameTarget: string): DnsRecord[] {
  return [
    {
      type: DnsRecordType.Txt,
      name: `${DNS_CHALLENGE_LABEL}.${domain.hostname}`,
      value: domain.verificationToken,
      verified: domain.ownershipVerified,
    },
    {
      type: DnsRecordType.Cname,
      name: domain.hostname,
      value: cnameTarget,
      verified: domain.routingVerified,
    },
  ];
}

/** A domain as the API returns it (PRD section 14). */
export function toDomainResponse(
  domain: Domain,
  cnameTarget: string,
): DomainResponse {
  const isPlatformDomain = domain.workspaceId === null;
  return {
    id: domain.id,
    hostname: domain.hostname,
    status: domain.status,
    isPlatformDomain,
    // A platform domain is already set up; its token is nobody's business.
    dnsRecords: isPlatformDomain ? [] : toDnsRecords(domain, cnameTarget),
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
    lastCheckedAt: domain.lastCheckedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
  };
}
