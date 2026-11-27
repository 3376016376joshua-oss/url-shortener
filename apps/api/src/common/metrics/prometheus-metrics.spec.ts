import { describe, expect, it } from 'vitest';
import { CounterName, GaugeName } from './metrics.js';
import { PrometheusMetrics } from './prometheus-metrics.js';

describe('PrometheusMetrics', () => {
  it('exposes every counter and gauge before anything is recorded', async () => {
    const output = await new PrometheusMetrics().render();

    for (const name of Object.values(CounterName)) {
      expect(output).toContain(`# TYPE ${name} counter`);
    }
    for (const name of Object.values(GaugeName)) {
      expect(output).toContain(`# TYPE ${name} gauge`);
    }
    expect(output).toContain('# TYPE http_request_duration_seconds histogram');
  });

  it('counts by label', async () => {
    const metrics = new PrometheusMetrics();

    metrics.incrementCounter(CounterName.Redirects, { outcome: 'found' });
    metrics.incrementCounter(CounterName.Redirects, { outcome: 'found' });
    metrics.incrementCounter(CounterName.Redirects, { outcome: 'gone' });

    const output = await metrics.render();
    expect(output).toContain('redirects_total{outcome="found"} 2');
    expect(output).toContain('redirects_total{outcome="gone"} 1');
  });

  it('counts a metric that has no labels', async () => {
    const metrics = new PrometheusMetrics();

    metrics.incrementCounter(CounterName.ShortCodeCollisions);

    expect(await metrics.render()).toContain('short_code_collisions_total 1');
  });

  it('sets a gauge to the latest value', async () => {
    const metrics = new PrometheusMetrics();

    metrics.setGauge(GaugeName.ClickStreamLag, 40);
    metrics.setGauge(GaugeName.ClickStreamLag, 12);

    expect(await metrics.render()).toContain('click_stream_lag 12');
  });

  it('records a request duration under its route, method, and status', async () => {
    const metrics = new PrometheusMetrics();

    metrics.observeHttpRequest({
      route: '/:code',
      method: 'GET',
      status: 302,
      durationSeconds: 0.004,
    });

    const output = await metrics.render();
    expect(output).toContain(
      'http_request_duration_seconds_bucket{le="0.005",route="/:code",method="GET",status="302"} 1',
    );
    expect(output).toContain(
      'http_request_duration_seconds_count{route="/:code",method="GET",status="302"} 1',
    );
  });

  it('never throws for a label the metric does not have', async () => {
    const metrics = new PrometheusMetrics();

    expect(() => {
      metrics.incrementCounter(CounterName.Redirects, { nonsense: 'x' });
    }).not.toThrow();
    expect(await metrics.render()).not.toContain('nonsense');
  });

  it('keeps separate instances apart', async () => {
    const first = new PrometheusMetrics();
    const second = new PrometheusMetrics();

    first.incrementCounter(CounterName.ShortCodeCollisions);

    expect(await second.render()).not.toContain(
      'short_code_collisions_total 1',
    );
  });
});
