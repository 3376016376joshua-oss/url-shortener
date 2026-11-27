/** How long a domain or a link may be served from the cache. */
export const ENTRY_TTL_MS = 3_600_000;

/** How long "this does not exist" is remembered, for hosts, codes, and expired links. */
export const NEGATIVE_TTL_MS = 60_000;

/**
 * How long a tombstone blocks readers from writing back a row they read
 * before the commit. Longer than any read can take under the Redis and
 * Postgres timeouts.
 */
export const TOMBSTONE_TTL_MS = 5_000;

export function domainKey(host: string): string {
  return `domain:${host}`;
}

/** Codes never contain a colon, so the last one always separates host and code. */
export function linkKey(host: string, code: string): string {
  return `link:${host}:${code}`;
}

/**
 * A link's entry never outlives its expiry, so the first request after it
 * expires re-reads the row. An already expired link is remembered briefly,
 * like a code that does not exist.
 */
export function linkTtlMs(expiresAt: Date | null, now: Date): number {
  if (expiresAt === null) {
    return ENTRY_TTL_MS;
  }
  const untilExpiry = expiresAt.getTime() - now.getTime();
  return untilExpiry <= 0
    ? NEGATIVE_TTL_MS
    : Math.min(ENTRY_TTL_MS, untilExpiry);
}
