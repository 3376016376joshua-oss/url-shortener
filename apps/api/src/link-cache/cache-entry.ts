import { z } from 'zod';
import { StoredLinkStatus } from '../common/link/link-state.js';
import { DomainStatus } from '../database/entities/domain.entity.js';

const cachedDomainSchema = z.object({
  id: z.string().min(1),
  status: z.enum(DomainStatus),
});

const cachedVariantSchema = z.object({
  id: z.string().min(1),
  destinationUrl: z.string().min(1),
  weight: z.number(),
});

const cachedLinkSchema = z.object({
  id: z.string().min(1),
  /** Tells an entry left by a previous owner of the host from a current one. */
  domainId: z.string().min(1),
  destinationUrl: z.string().min(1),
  status: z.enum(StoredLinkStatus),
  expiresAt: z.iso
    .datetime()
    .nullable()
    .transform((value) => (value === null ? null : new Date(value))),
  // Variants that cannot be read must not cost the link its redirect: with
  // none, the control is served.
  variants: z.array(cachedVariantSchema).catch([]),
});

/** What the redirect needs to know about the domain serving a host. */
export type CachedDomain = z.infer<typeof cachedDomainSchema>;
export type CachedVariant = z.infer<typeof cachedVariantSchema>;
/** What the redirect needs to know about a link, including its active variants. */
export type CachedLink = z.infer<typeof cachedLinkSchema>;

/**
 * What one cache key held when it was read.
 *
 * - `hit`: the row, as it was when it was cached.
 * - `not_found`: the row is known not to exist.
 * - `unusable`: a tombstone left by a write, or a value that cannot be read.
 *   The answer must come from Postgres and the key must be left alone.
 * - `miss`: nothing is cached; the answer comes from Postgres and is cached.
 */
export type CacheRead<T> =
  | { kind: 'hit'; value: T }
  | { kind: 'not_found' }
  | { kind: 'unusable' }
  | { kind: 'miss' };

const NOT_FOUND_MARKER = 'notFound';
const TOMBSTONE_MARKER = 'invalidated';

export const NOT_FOUND_ENTRY = JSON.stringify({ [NOT_FOUND_MARKER]: true });
export const TOMBSTONE_ENTRY = JSON.stringify({ [TOMBSTONE_MARKER]: true });

function hasMarker(value: unknown, marker: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[marker] === true
  );
}

function decode<T>(raw: string | null, schema: z.ZodType<T>): CacheRead<T> {
  if (raw === null) {
    return { kind: 'miss' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'unusable' };
  }
  if (hasMarker(parsed, TOMBSTONE_MARKER)) {
    return { kind: 'unusable' };
  }
  if (hasMarker(parsed, NOT_FOUND_MARKER)) {
    return { kind: 'not_found' };
  }
  const result = schema.safeParse(parsed);
  return result.success
    ? { kind: 'hit', value: result.data }
    : { kind: 'unusable' };
}

export function decodeDomain(raw: string | null): CacheRead<CachedDomain> {
  return decode(raw, cachedDomainSchema);
}

export function decodeLink(raw: string | null): CacheRead<CachedLink> {
  return decode(raw, cachedLinkSchema);
}

export function encodeDomain(domain: CachedDomain | null): string {
  return domain === null ? NOT_FOUND_ENTRY : JSON.stringify(domain);
}

/** `Date` serialises to the ISO string the schema reads back. */
export function encodeLink(link: CachedLink | null): string {
  return link === null ? NOT_FOUND_ENTRY : JSON.stringify(link);
}
