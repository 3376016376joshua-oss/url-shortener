import { Injectable } from '@nestjs/common';
import { Metrics } from './metrics.js';

/** Placeholder until the platform workstream ships the real metrics backend. */
@Injectable()
export class NoopMetrics extends Metrics {
  incrementCounter(): void {}
}
