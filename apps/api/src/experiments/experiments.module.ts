import { Module } from '@nestjs/common';
import { ControlDestinationSelector } from './control-destination-selector.js';
import { DestinationSelector } from './destination-selector.js';

/** A/B destination assignment (PRD section 11). Built by the QR and experiments workstream. */
@Module({
  providers: [
    { provide: DestinationSelector, useClass: ControlDestinationSelector },
  ],
  exports: [DestinationSelector],
})
export class ExperimentsModule {}
