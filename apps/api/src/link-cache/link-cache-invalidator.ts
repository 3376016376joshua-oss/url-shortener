/** How the write path tells the read path that something changed. */
export abstract class LinkCacheInvalidator {
  /**
   * Call after the database commit whenever a link or its variants are
   * created, changed, or deleted. Never rejects: a failed invalidation is
   * logged and counted, and the cache TTL bounds the staleness.
   */
  abstract invalidateLink(hostname: string, code: string): Promise<void>;

  /**
   * Call after the database commit whenever a domain is added, removed, or
   * changes status. Takes effect for every link on the domain at once.
   */
  abstract invalidateDomain(hostname: string): Promise<void>;
}
