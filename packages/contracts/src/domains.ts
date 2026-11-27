import { z } from 'zod';

export const DomainStatus = {
  /** Added, waiting for its DNS records to be verified. */
  Pending: 'PENDING',
  /** Verified and serving redirects. */
  Active: 'ACTIVE',
  /** Verification failed, or DNS stopped pointing at the platform. */
  Inactive: 'INACTIVE',
  /** Taken down by a platform admin. */
  Blocked: 'BLOCKED',
} as const;
export type DomainStatus = (typeof DomainStatus)[keyof typeof DomainStatus];

export const DnsRecordType = {
  /** Proves the workspace controls the domain. */
  Txt: 'TXT',
  /** Proves traffic for the host reaches the platform. */
  Cname: 'CNAME',
} as const;
export type DnsRecordType = (typeof DnsRecordType)[keyof typeof DnsRecordType];

/** The label the ownership TXT record is published under, in front of the host. */
export const DNS_CHALLENGE_LABEL = '_shortener-challenge';

export const MAX_HOSTNAME_LENGTH = 253;

const HOSTNAME_LABEL = '[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?';
/** Two or more labels: a bare name such as `intranet` is not a public host. */
const HOSTNAME = new RegExp(`^${HOSTNAME_LABEL}(\\.${HOSTNAME_LABEL})+$`);
/** No real top-level domain is all digits, and an IPv4 address ends in one. */
const NUMERIC_TOP_LEVEL_DOMAIN = /\.\d+$/;
/**
 * Top-level domains reserved for private or special use (RFC 6761, RFC 8375,
 * RFC 9476). Nothing under them can be reached from the public internet.
 */
const NON_PUBLIC_TOP_LEVEL_DOMAINS: ReadonlySet<string> = new Set([
  'alt',
  'arpa',
  'example',
  'internal',
  'invalid',
  'lan',
  'local',
  'localhost',
  'onion',
  'test',
]);

function isPublicHostname(hostname: string): boolean {
  if (!HOSTNAME.test(hostname) || NUMERIC_TOP_LEVEL_DOMAIN.test(hostname)) {
    return false;
  }
  const topLevelDomain = hostname.slice(hostname.lastIndexOf('.') + 1);
  return !NON_PUBLIC_TOP_LEVEL_DOMAINS.has(topLevelDomain);
}

/**
 * A host name a workspace may connect: public, in ASCII form (an
 * internationalised name is sent as punycode), and never an IP address.
 * Stored lowercase.
 */
export const domainHostnameSchema = z
  .string()
  .max(MAX_HOSTNAME_LENGTH, `must be at most ${MAX_HOSTNAME_LENGTH} characters`)
  .transform((value) => value.toLowerCase())
  .refine(
    isPublicHostname,
    'must be a public host name such as go.example.com, not an IP address',
  );

/** `POST /workspaces/{workspaceId}/domains` */
export const createDomainRequestSchema = z.strictObject({
  hostname: domainHostnameSchema,
});
export type CreateDomainRequest = z.infer<typeof createDomainRequestSchema>;

/** One DNS record the owner must publish, and whether the last check saw it. */
export const dnsRecordSchema = z.object({
  type: z.enum(DnsRecordType),
  name: z.string(),
  value: z.string(),
  verified: z.boolean(),
});
export type DnsRecord = z.infer<typeof dnsRecordSchema>;

export const domainSchema = z.object({
  id: z.uuid(),
  hostname: z.string(),
  status: z.enum(DomainStatus),
  /** True for the platform's own short domain, which every workspace may use. */
  isPlatformDomain: z.boolean(),
  /** Empty for a platform domain: there is nothing for a workspace to set up. */
  dnsRecords: z.array(dnsRecordSchema),
  verifiedAt: z.iso.datetime().nullable(),
  lastCheckedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type DomainResponse = z.infer<typeof domainSchema>;

/**
 * `GET /workspaces/{workspaceId}/domains`. The domain quota keeps the list to
 * one page, so `nextCursor` is always `null`.
 */
export const domainListSchema = z.object({
  items: z.array(domainSchema),
  nextCursor: z.string().nullable(),
});
export type DomainListResponse = z.infer<typeof domainListSchema>;

/** The path parameters of every domain route. */
export const workspaceDomainsParamsSchema = z.object({
  workspaceId: z.uuid(),
});
export const workspaceDomainParamsSchema = z.object({
  workspaceId: z.uuid(),
  domainId: z.uuid(),
});
export type WorkspaceDomainsParams = z.infer<
  typeof workspaceDomainsParamsSchema
>;
export type WorkspaceDomainParams = z.infer<typeof workspaceDomainParamsSchema>;
