export interface VariantTarget {
  id: string;
  destinationUrl: string;
  /** Percentage of traffic, 1 to 99. */
  weight: number;
}

/** What the redirect path knows about a link when choosing where to send a visitor. */
export interface RedirectTarget {
  linkId: string;
  /** The control destination, and the fallback. */
  destinationUrl: string;
  /** Active variants only; empty when no A/B test is running. */
  variants: ReadonlyArray<VariantTarget>;
}

export interface Visitor {
  ip: string;
  userAgent: string | null;
}

export interface SelectedDestination {
  destinationUrl: string;
  /** The variant served, or `null` for the control. */
  variantId: string | null;
}

/** How the redirect path picks a destination when a link has an A/B test. */
export abstract class DestinationSelector {
  /**
   * Synchronous and total: it never throws and always returns a destination,
   * falling back to the control whenever a variant cannot be chosen. The same
   * visitor gets the same answer for the same link.
   */
  abstract select(
    target: RedirectTarget,
    visitor: Visitor,
  ): SelectedDestination;
}
