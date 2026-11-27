import { Injectable } from '@nestjs/common';
import { ClickRecorder } from './click-recorder.js';

/** Placeholder until the analytics workstream ships the click pipeline. */
@Injectable()
export class NoopClickRecorder extends ClickRecorder {
  record(): void {}
}
