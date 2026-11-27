/** Counters feature modules report (PRD section 13). */
export const CounterName = {
  Redirects: 'redirects_total',
  LinkCacheLookups: 'link_cache_lookups_total',
  LinkCacheInvalidationFailures: 'link_cache_invalidation_failures_total',
  LinksCreated: 'links_created_total',
  ShortCodeCollisions: 'short_code_collisions_total',
  RateLimitRejections: 'rate_limit_rejections_total',
  ClickEvents: 'click_events_total',
  DomainVerifications: 'domain_verifications_total',
  SignIns: 'sign_ins_total',
  QrCodesRendered: 'qr_codes_rendered_total',
  JobRuns: 'job_runs_total',
} as const;
export type CounterName = (typeof CounterName)[keyof typeof CounterName];

/** Gauges feature modules report. */
export const GaugeName = {
  ClickStreamLag: 'click_stream_lag',
} as const;
export type GaugeName = (typeof GaugeName)[keyof typeof GaugeName];

export type MetricLabels = Readonly<Record<string, string>>;

/**
 * How feature modules report metrics, without knowing the backend. Neither
 * method ever throws: a metric that cannot be recorded is logged and dropped,
 * so reporting is safe on the redirect path.
 */
export abstract class Metrics {
  abstract incrementCounter(name: CounterName, labels?: MetricLabels): void;

  abstract setGauge(name: GaugeName, value: number): void;
}
