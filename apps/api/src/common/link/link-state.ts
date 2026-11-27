/** What is stored in `url_mappings.status`. Expiry is derived, never stored. */
export const StoredLinkStatus = {
  Active: 'ACTIVE',
  /** Switched off by the workspace; it can switch it back on. */
  Disabled: 'DISABLED',
  /** Taken down by a platform admin; the workspace cannot undo it. */
  Blocked: 'BLOCKED',
} as const;
export type StoredLinkStatus =
  (typeof StoredLinkStatus)[keyof typeof StoredLinkStatus];

/** The effective state of a link at a point in time. */
export const LinkState = {
  Active: 'ACTIVE',
  Disabled: 'DISABLED',
  Blocked: 'BLOCKED',
  Expired: 'EXPIRED',
} as const;
export type LinkState = (typeof LinkState)[keyof typeof LinkState];

export interface LinkStateInput {
  status: StoredLinkStatus;
  expiresAt: Date | null;
}

/**
 * The single rule for whether a link may redirect, applied identically to
 * database rows and cache hits. A stored status other than active wins over
 * expiry, and blocked is reported as blocked.
 */
export function resolveLinkState(link: LinkStateInput, now: Date): LinkState {
  if (link.status !== StoredLinkStatus.Active) {
    return link.status;
  }
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) {
    return LinkState.Expired;
  }
  return LinkState.Active;
}
