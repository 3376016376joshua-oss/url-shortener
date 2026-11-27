/** What is stored in `url_mappings.status`. Expiry is derived, never stored. */
export const StoredLinkStatus = {
  Active: 'ACTIVE',
  Disabled: 'DISABLED',
} as const;
export type StoredLinkStatus =
  (typeof StoredLinkStatus)[keyof typeof StoredLinkStatus];

/** The effective state of a link at a point in time. */
export const LinkState = {
  Active: 'ACTIVE',
  Disabled: 'DISABLED',
  Expired: 'EXPIRED',
} as const;
export type LinkState = (typeof LinkState)[keyof typeof LinkState];

export interface LinkStateInput {
  status: StoredLinkStatus;
  expiresAt: Date | null;
}

/**
 * The single rule for whether a link may redirect, applied identically to
 * database rows and cache hits. Disabled wins over expired.
 */
export function resolveLinkState(link: LinkStateInput, now: Date): LinkState {
  if (link.status === StoredLinkStatus.Disabled) {
    return LinkState.Disabled;
  }
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) {
    return LinkState.Expired;
  }
  return LinkState.Active;
}
