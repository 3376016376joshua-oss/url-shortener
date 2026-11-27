import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CounterName,
  GaugeName,
  Metrics,
} from '../src/common/metrics/metrics.js';
import { createTestApp } from './support/create-test-app.js';

/** Every metric PRD section 13 lists, with its type. */
const DOCUMENTED_METRICS = [
  ['http_request_duration_seconds', 'histogram'],
  ['redirects_total', 'counter'],
  ['link_cache_lookups_total', 'counter'],
  ['link_cache_invalidation_failures_total', 'counter'],
  ['links_created_total', 'counter'],
  ['short_code_collisions_total', 'counter'],
  ['rate_limit_rejections_total', 'counter'],
  ['click_events_total', 'counter'],
  ['click_stream_lag', 'gauge'],
  ['domain_verifications_total', 'counter'],
  ['sign_ins_total', 'counter'],
  ['qr_codes_rendered_total', 'counter'],
  ['job_runs_total', 'counter'],
] as const;

describe('GET /metrics', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers in the Prometheus text format, uncached', async () => {
    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(
      /^text\/plain; version=0\.0\.4/,
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each(DOCUMENTED_METRICS)('exposes %s as a %s', async (name, type) => {
    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.text).toContain(`# TYPE ${name} ${type}`);
  });

  it('exposes what feature modules report through the Metrics contract', async () => {
    const metrics = app.get(Metrics);
    metrics.incrementCounter(CounterName.ClickEvents, { result: 'recorded' });
    metrics.incrementCounter(CounterName.JobRuns, {
      job: 'partitions',
      result: 'success',
    });
    metrics.setGauge(GaugeName.ClickStreamLag, 7);

    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.text).toContain('click_events_total{result="recorded"} 1');
    expect(response.text).toContain(
      'job_runs_total{job="partitions",result="success"} 1',
    );
    expect(response.text).toContain('click_stream_lag 7');
  });

  it('times requests under the route pattern, never the actual path', async () => {
    const userId = '0198c0de-0000-7000-8000-000000000001';
    await request(app.getHttpServer()).post(
      `/api/v1/admin/users/${userId}/disable`,
    );

    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.text).toContain(
      'http_request_duration_seconds_count{route="/api/v1/admin/users/:userId/disable",method="POST",status="401"} 1',
    );
    expect(response.text).not.toContain(userId);
  });

  it('files every unknown path under one route label', async () => {
    await request(app.getHttpServer()).get('/no/such/route');
    await request(app.getHttpServer()).get('/nor/this/one');

    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.text).toContain(
      'http_request_duration_seconds_count{route="unmatched",method="GET",status="404"} 2',
    );
    expect(response.text).not.toContain('/no/such/route');
  });

  it('reports the health of the process itself', async () => {
    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.text).toContain('process_resident_memory_bytes');
    expect(response.text).toContain('nodejs_eventloop_lag_seconds');
  });
});
