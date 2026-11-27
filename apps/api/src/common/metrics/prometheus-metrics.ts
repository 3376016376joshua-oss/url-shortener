import { Injectable, Logger } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import {
  COUNTER_DEFINITIONS,
  GAUGE_DEFINITIONS,
  HTTP_REQUEST_DURATION,
} from './metric-definitions.js';
import {
  Metrics,
  type CounterName,
  type GaugeName,
  type MetricLabels,
} from './metrics.js';

export interface HttpRequestObservation {
  /** The route pattern, never the actual path, to bound cardinality. */
  route: string;
  method: string;
  status: number;
  durationSeconds: number;
}

/**
 * The Prometheus backend behind `Metrics`. Each instance owns its registry,
 * so several applications in one process (the end-to-end tests) never share
 * or double-register a metric.
 */
@Injectable()
export class PrometheusMetrics extends Metrics {
  private readonly logger = new Logger(PrometheusMetrics.name);
  private readonly registry = new Registry();
  private readonly counters = new Map<CounterName, Counter>();
  private readonly gauges = new Map<GaugeName, Gauge>();
  private readonly httpRequestDuration: Histogram;

  constructor() {
    super();
    const registers = [this.registry];
    for (const [name, definition] of Object.entries(COUNTER_DEFINITIONS)) {
      this.counters.set(
        name as CounterName,
        new Counter({ name, ...definition, registers }),
      );
    }
    for (const [name, definition] of Object.entries(GAUGE_DEFINITIONS)) {
      this.gauges.set(
        name as GaugeName,
        new Gauge({ name, ...definition, registers }),
      );
    }
    this.httpRequestDuration = new Histogram({
      ...HTTP_REQUEST_DURATION,
      buckets: [...HTTP_REQUEST_DURATION.buckets],
      registers,
    });
    collectDefaultMetrics({ register: this.registry });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  incrementCounter(name: CounterName, labels: MetricLabels = {}): void {
    this.record(name, () => this.counters.get(name)?.inc(labels));
  }

  setGauge(name: GaugeName, value: number): void {
    this.record(name, () => this.gauges.get(name)?.set(value));
  }

  observeHttpRequest(observation: HttpRequestObservation): void {
    const { durationSeconds, route, method, status } = observation;
    this.record(HTTP_REQUEST_DURATION.name, () =>
      this.httpRequestDuration.observe(
        { route, method, status: String(status) },
        durationSeconds,
      ),
    );
  }

  /** The current value of every metric, in the Prometheus text format. */
  render(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * A metric is never worth failing a request for: a bad label or value is a
   * bug in the caller, reported here and otherwise ignored.
   */
  private record(name: string, write: () => void): void {
    try {
      write();
    } catch (error) {
      this.logger.warn(`Could not record metric ${name}: ${String(error)}`);
    }
  }
}
