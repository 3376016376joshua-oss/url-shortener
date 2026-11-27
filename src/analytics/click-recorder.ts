export interface ClickInput {
  /** `UrlMapping.id` of the link that was followed. */
  linkId: string;
  clickedAt: Date;
  /** Raw Referer header, reduced to its host before storage. */
  referrer: string | null;
  /** Raw User-Agent header, reduced to a coarse class before storage. */
  userAgent: string | null;
}

/** How the redirect path hands a click to analytics. */
export abstract class ClickRecorder {
  /**
   * Returns immediately and never throws: analytics must never delay or fail
   * a redirect. An event that cannot be recorded is dropped and counted.
   */
  abstract record(click: ClickInput): void;
}
