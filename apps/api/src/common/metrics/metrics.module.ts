import { Global, Module } from '@nestjs/common';
import { Metrics } from './metrics.js';
import { NoopMetrics } from './noop-metrics.js';

@Global()
@Module({
  providers: [{ provide: Metrics, useClass: NoopMetrics }],
  exports: [Metrics],
})
export class MetricsModule {}
