import { Module } from '@nestjs/common';
import { ClickRecorder } from './click-recorder.js';
import { NoopClickRecorder } from './noop-click-recorder.js';

/** Async click analytics (PRD section 10). Built by the ops workstream. */
@Module({
  providers: [{ provide: ClickRecorder, useClass: NoopClickRecorder }],
  exports: [ClickRecorder],
})
export class AnalyticsModule {}
