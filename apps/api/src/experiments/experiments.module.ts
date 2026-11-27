import { Module } from '@nestjs/common';
import { DestinationSelector } from './destination-selector.js';
import { WeightedDestinationSelector } from './weighted-destination-selector.js';

/** A/B destination assignment (PRD section 11). */
@Module({
  providers: [
    { provide: DestinationSelector, useClass: WeightedDestinationSelector },
  ],
  exports: [DestinationSelector],
})
export class ExperimentsModule {}
