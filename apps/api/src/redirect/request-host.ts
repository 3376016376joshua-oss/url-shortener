const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * The host a request was addressed to, in the form domains are stored in:
 * lowercased, without the trailing dot of a fully qualified name. `null`
 * when it is missing or cannot be a host name, so that junk in a Host header
 * never reaches the cache or the database.
 */
export function normaliseHost(hostname: string | undefined): string | null {
  if (hostname === undefined) {
    return null;
  }
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return HOSTNAME.test(host) ? host : null;
}
