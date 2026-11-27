import { CounterName, GaugeName } from './metrics.js';

export interface MetricDefinition {
  help: string;
  labelNames: readonly string[];
}

/** Every counter the platform exposes, with the labels it accepts. */
export const COUNTER_DEFINITIONS: Readonly<
  Record<CounterName, MetricDefinition>
> = {
  [CounterName.Redirects]: {
    help: 'Redirect requests, by outcome',
    labelNames: ['outcome'],
  },
  [CounterName.LinkCacheLookups]: {
    help: 'Redirect cache lookups, by result',
    labelNames: ['result'],
  },
  [CounterName.LinkCacheInvalidationFailures]: {
    help: 'Cache invalidations that could not be written to Redis',
    labelNames: [],
  },
  [CounterName.LinksCreated]: {
    help: 'Links created, by kind of code',
    labelNames: ['kind'],
  },
  [CounterName.ShortCodeCollisions]: {
    help: 'Generated codes that collided with an existing code',
    labelNames: [],
  },
  [CounterName.RateLimitRejections]: {
    help: 'Requests refused by a rate limit, by policy',
    labelNames: ['policy'],
  },
  [CounterName.ClickEvents]: {
    help: 'Click events, by what happened to them',
    labelNames: ['result'],
  },
  [CounterName.DomainVerifications]: {
    help: 'Domain verification checks, by result',
    labelNames: ['result'],
  },
  [CounterName.SignIns]: {
    help: 'Sign-in attempts, by result',
    labelNames: ['result'],
  },
  [CounterName.QrCodesRendered]: {
    help: 'QR codes rendered, by format',
    labelNames: ['format'],
  },
  [CounterName.JobRuns]: {
    help: 'Scheduled job runs, by job and result',
    labelNames: ['job', 'result'],
  },
};

export const GAUGE_DEFINITIONS: Readonly<Record<GaugeName, MetricDefinition>> =
  {
    [GaugeName.ClickStreamLag]: {
      help: 'How far the click consumer is behind the stream',
      labelNames: [],
    },
  };

export const HTTP_REQUEST_DURATION = {
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests, by route pattern, method, and status',
  labelNames: ['route', 'method', 'status'],
  /**
   * Chosen so the latency objectives (20 ms, 50 ms, 100 ms, 300 ms) each sit
   * on a bucket boundary and can be alerted on exactly.
   */
  buckets: [0.005, 0.01, 0.02, 0.05, 0.1, 0.3, 0.5, 1, 2.5, 5],
} as const;
