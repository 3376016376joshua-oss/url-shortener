/** How the write path tells the read path that a link changed. */
export abstract class LinkCacheInvalidator {
  /**
   * Call after the database commit. Never rejects: a failed invalidation is
   * logged and counted, and the cache TTL bounds the staleness.
   */
  abstract invalidate(shortCode: string): Promise<void>;
}
