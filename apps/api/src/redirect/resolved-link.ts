import type { CachedDomain, CachedLink } from '../link-cache/cache-entry.js';

/**
 * What a host and code lead to. `domain` is `null` when no domain serves the
 * host; `link` is `null` when the code does not exist on that domain.
 */
export interface ResolvedLink {
  domain: CachedDomain | null;
  link: CachedLink | null;
}
