import type { ClickSource } from '../database/entities/click-event.entity.js';

export interface ClickInput {
  linkId: string;
  /** The A/B variant served, or `null` for the control. */
  variantId: string | null;
  source: ClickSource;
  clickedAt: Date;
  /**
   * The visitor's address. Used in memory only, to look up the country and
   * to compute the day's visitor hash. It is never stored or queued.
   */
  ip: string;
  /** Raw User-Agent header, reduced to device, OS, and browser. */
  userAgent: string | null;
  /** Raw Referer header, reduced to its host. */
  referrer: string | null;
}

/** How the redirect path hands a click to analytics. */
export abstract class ClickRecorder {
  /**
   * Returns immediately and never throws: analytics must never delay or fail
   * a redirect. An event that cannot be recorded is dropped and counted.
   */
  abstract record(click: ClickInput): void;
}
