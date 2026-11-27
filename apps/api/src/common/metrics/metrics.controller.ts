import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrometheusMetrics } from './prometheus-metrics.js';

/**
 * The Prometheus scrape endpoint. Internal network only: the edge refuses
 * `/metrics` on every host.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: PrometheusMetrics) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.type(this.metrics.contentType);
    return this.metrics.render();
  }
}
