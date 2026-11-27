/** Host names are at most 253 characters; anything longer is not one. */
const MAX_HOST_LENGTH = 253;
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Reduces a raw Referer header to its host, lowercased. The path and query,
 * which can identify a person or carry a token, are dropped here and never
 * leave the process. `null` means a direct visit.
 */
export function reduceReferrer(referrer: string | null): string | null {
  if (referrer === null || !URL.canParse(referrer)) {
    return null;
  }
  const { protocol, hostname } = new URL(referrer);
  if (!WEB_PROTOCOLS.has(protocol) || hostname === '') {
    return null;
  }
  return hostname.length > MAX_HOST_LENGTH ? null : hostname.toLowerCase();
}
