import { LinkState, resolveLinkState } from '../common/link/link-state.js';
import { DomainStatus } from '../database/entities/domain.entity.js';
import type { CachedLink } from '../link-cache/cache-entry.js';
import type { ResolvedLink } from './resolved-link.js';

export type GoneReason = 'expired' | 'disabled';

export type RedirectDecision =
  | { outcome: 'found'; link: CachedLink }
  | { outcome: 'not_found' }
  | { outcome: 'gone'; reason: GoneReason };

/**
 * The state rules of PRD section 7, applied on every request to whatever the
 * lookup returned, cached or not: a cache hit is never a free pass.
 */
export function decideRedirect(
  resolved: ResolvedLink,
  now: Date,
): RedirectDecision {
  const { domain, link } = resolved;
  if (domain === null || domain.status !== DomainStatus.Active) {
    return { outcome: 'not_found' };
  }
  if (link === null) {
    return { outcome: 'not_found' };
  }
  switch (resolveLinkState(link, now)) {
    case LinkState.Active:
      return { outcome: 'found', link };
    case LinkState.Expired:
      return { outcome: 'gone', reason: 'expired' };
    case LinkState.Disabled:
    case LinkState.Blocked:
      return { outcome: 'gone', reason: 'disabled' };
  }
}
