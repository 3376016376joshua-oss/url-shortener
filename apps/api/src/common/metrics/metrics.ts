/** Counters feature modules report (PRD section 13). */
export const CounterName = {
  Redirects: 'redirects_total',
  LinkCacheLookups: 'link_cache_lookups_total',
  LinkCacheInvalidationFailures: 'link_cache_invalidation_failures_total',
  LinksCreated: 'links_created_total',
  ShortCodeCollisions: 'short_code_collisions_total',
  DomainVerifications: 'domain_verifications_total',
  SignIns: 'sign_ins_total',
  QrCodesRendered: 'qr_codes_rendered_total',
} as const;
export type CounterName = (typeof CounterName)[keyof typeof CounterName];

export type MetricLabels = Readonly<Record<string, string>>;

/** How feature modules report metrics, without knowing the backend. */
export abstract class Metrics {
  abstract incrementCounter(name: CounterName, labels?: MetricLabels): void;
}
