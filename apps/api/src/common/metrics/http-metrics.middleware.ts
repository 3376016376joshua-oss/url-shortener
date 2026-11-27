import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrometheusMetrics } from './prometheus-metrics.js';
import { routePattern } from './route-pattern.js';

const NANOSECONDS_PER_SECOND = 1e9;

/** Times every request and reports it once the response has been sent. */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: PrometheusMetrics) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const elapsed = process.hrtime.bigint() - startedAt;
      this.metrics.observeHttpRequest({
        route: routePattern(request),
        method: request.method,
        status: response.statusCode,
        durationSeconds: Number(elapsed) / NANOSECONDS_PER_SECOND,
      });
    });
    next();
  }
}
