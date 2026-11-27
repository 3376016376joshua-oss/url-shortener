/** The closed set of metric names the application emits (PRD section 12). */
export const MetricName = {
  HttpRequestDuration: 'http_request_duration_seconds',
  Redirects: 'redirects_total',
  LinkCacheLookups: 'link_cache_lookups_total',
  LinkCacheInvalidationFailures: 'link_cache_invalidation_failures_total',
  LinksCreated: 'links_created_total',
  ShortCodeCollisions: 'short_code_collisions_total',
  RateLimitRejections: 'rate_limit_rejections_total',
  ClickEvents: 'click_events_total',
  ClickStreamLag: 'click_stream_lag',
} as const;
export type MetricName = (typeof MetricName)[keyof typeof MetricName];

export type MetricLabels = Readonly<Record<string, string>>;

/** How feature modules report metrics, without knowing the backend. */
export abstract class Metrics {
  abstract incrementCounter(name: MetricName, labels?: MetricLabels): void;

  abstract observeDuration(
    name: MetricName,
    seconds: number,
    labels?: MetricLabels,
  ): void;
}
