/**
 * The lookup could not be completed: a timeout, an unreachable resolver, or a
 * server failure. It says nothing about whether the record exists.
 */
export class DnsLookupError extends Error {
  constructor(name: string, cause: unknown) {
    super(`DNS lookup for ${name} failed: ${String(cause)}`, { cause });
    this.name = DnsLookupError.name;
  }
}

/**
 * The DNS questions domain verification asks. Each answer is the records that
 * exist, empty when the name or the record type does not; a lookup that could
 * not be completed rejects with `DnsLookupError`.
 */
export abstract class DnsResolver {
  /** TXT records, each with its character strings joined into one value. */
  abstract resolveTxt(name: string): Promise<string[]>;

  /** The host names the name is an alias for. */
  abstract resolveCname(name: string): Promise<string[]>;

  /** IPv4 and IPv6 addresses, following any aliases. */
  abstract resolveAddresses(name: string): Promise<string[]>;
}
