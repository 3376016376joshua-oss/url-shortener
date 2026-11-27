import { DomainStatus } from '../database/entities/domain.entity.js';
import type { CacheSnapshot } from '../link-cache/link-cache.js';
import type { ResolvedLink } from './resolved-link.js';

export interface CachedAnswer {
  resolved: ResolvedLink;
  /** `negative_hit` when the cache answered "does not exist". */
  result: 'hit' | 'negative_hit';
}

/**
 * The answer the cache alone can give, or `null` when Postgres has to be
 * asked. The domain is settled first: when no active domain serves the host,
 * nothing about the link matters.
 */
export function answerFromCache(snapshot: CacheSnapshot): CachedAnswer | null {
  const { domain, link } = snapshot;
  if (domain.kind === 'not_found') {
    return { resolved: { domain: null, link: null }, result: 'negative_hit' };
  }
  if (domain.kind !== 'hit') {
    return null;
  }
  if (domain.value.status !== DomainStatus.Active) {
    return { resolved: { domain: domain.value, link: null }, result: 'hit' };
  }
  if (link.kind === 'not_found') {
    return {
      resolved: { domain: domain.value, link: null },
      result: 'negative_hit',
    };
  }
  // Link keys are named by host. When a host changes hands, entries of the
  // previous owner's domain are still there and must not be served.
  if (link.kind === 'hit' && link.value.domainId === domain.value.id) {
    return {
      resolved: { domain: domain.value, link: link.value },
      result: 'hit',
    };
  }
  return null;
}
