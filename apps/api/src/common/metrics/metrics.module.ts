import {
  Global,
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsController } from './metrics.controller.js';
import { Metrics } from './metrics.js';
import { PrometheusMetrics } from './prometheus-metrics.js';

/** Prometheus metrics and `GET /metrics` (PRD section 13). */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    PrometheusMetrics,
    { provide: Metrics, useExisting: PrometheusMetrics },
  ],
  exports: [Metrics],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('{*path}');
  }
}
