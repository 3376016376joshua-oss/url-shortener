import { Injectable, Logger } from '@nestjs/common';
import { CounterName, Metrics } from '../common/metrics/metrics.js';
import { linkKey } from '../link-cache/cache-policy.js';
import { LinkCache, type CacheSnapshot } from '../link-cache/link-cache.js';
import { answerFromCache } from './cached-answer.js';
import { RedirectLinkRepository } from './redirect-link.repository.js';
import type { ResolvedLink } from './resolved-link.js';
import { SingleFlight } from './single-flight.js';

type LookupResult = 'hit' | 'miss' | 'negative_hit' | 'error';

/**
 * The cache-aside lookup behind every redirect (PRD section 7): Redis first,
 * Postgres on a miss, and the result written back for the next request.
 *
 * It degrades instead of failing. Without Redis every lookup is answered from
 * Postgres; without Postgres, links that are still cached keep resolving and
 * the rest reject with the database's error, which the caller reports as 503.
 */
@Injectable()
export class LinkResolver {
  private readonly logger = new Logger(LinkResolver.name);
  private readonly loads = new SingleFlight<ResolvedLink>();

  constructor(
    private readonly cache: LinkCache,
    private readonly repository: RedirectLinkRepository,
    private readonly metrics: Metrics,
  ) {}

  async resolve(host: string, code: string, now: Date): Promise<ResolvedLink> {
    const snapshot = await this.readCache(host, code);
    const cached = snapshot === null ? null : answerFromCache(snapshot);
    if (cached !== null) {
      this.count(cached.result);
      return cached.resolved;
    }
    this.count(snapshot === null ? 'error' : 'miss');
    return this.loads.run(linkKey(host, code), () =>
      this.loadAndPopulate(host, code, snapshot, now),
    );
  }

  /**
   * `null` when Redis could not answer. That is not logged here: the Redis
   * client reports the outage once, and a line per redirect would bury it.
   */
  private async readCache(
    host: string,
    code: string,
  ): Promise<CacheSnapshot | null> {
    try {
      return await this.cache.read(host, code);
    } catch {
      return null;
    }
  }

  private async loadAndPopulate(
    host: string,
    code: string,
    snapshot: CacheSnapshot | null,
    now: Date,
  ): Promise<ResolvedLink> {
    const resolved = await this.repository.findByHostAndCode(host, code);
    // Redis just failed the read, so writing to it would only add its
    // timeout to this redirect.
    if (snapshot !== null) {
      await this.populate(host, code, snapshot, resolved, now);
    }
    return resolved;
  }

  /**
   * Fills only the keys that were empty. A key holding a tombstone, or a
   * link of another domain, is left to expire, and is answered from Postgres
   * until it does.
   */
  private async populate(
    host: string,
    code: string,
    snapshot: CacheSnapshot,
    resolved: ResolvedLink,
    now: Date,
  ): Promise<void> {
    const writes: Promise<void>[] = [];
    if (snapshot.domain.kind === 'miss') {
      writes.push(this.cache.populateDomain(host, resolved.domain));
    }
    // Without a domain there is no namespace the code could be missing from.
    if (snapshot.link.kind === 'miss' && resolved.domain !== null) {
      writes.push(this.cache.populateLink(host, code, resolved.link, now));
    }
    const failed = (await Promise.allSettled(writes)).find(
      (write) => write.status === 'rejected',
    );
    if (failed !== undefined) {
      // The redirect is already decided; only the next lookup pays for this.
      this.logger.warn(
        `Could not cache the lookup of ${linkKey(host, code)}: ${String(failed.reason)}`,
      );
    }
  }

  private count(result: LookupResult): void {
    this.metrics.incrementCounter(CounterName.LinkCacheLookups, { result });
  }
}
