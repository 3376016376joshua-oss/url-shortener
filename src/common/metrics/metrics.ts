/** Counters the write and read paths report (PRD section 12). */
export const CounterName = {
  Redirects: 'redirects_total',
  LinkCacheLookups: 'link_cache_lookups_total',
  LinkCacheInvalidationFailures: 'link_cache_invalidation_failures_total',
  LinksCreated: 'links_created_total',
  ShortCodeCollisions: 'short_code_collisions_total',
} as const;
export type CounterName = (typeof CounterName)[keyof typeof CounterName];

export type MetricLabels = Readonly<Record<string, string>>;

/** How feature modules report metrics, without knowing the backend. */
export abstract class Metrics {
  abstract incrementCounter(name: CounterName, labels?: MetricLabels): void;
}
