import { Module } from '@nestjs/common';
import { ClickRecorder } from './click-recorder.js';
import { NoopClickRecorder } from './noop-click-recorder.js';

/** Click analytics: recording, enrichment, roll-ups, and queries (PRD section 10). Built by the analytics workstream. */
@Module({
  providers: [{ provide: ClickRecorder, useClass: NoopClickRecorder }],
  exports: [ClickRecorder],
})
export class AnalyticsModule {}
