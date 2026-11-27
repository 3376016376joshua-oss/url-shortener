import { Injectable } from '@nestjs/common';
import {
  DestinationSelector,
  type RedirectTarget,
  type SelectedDestination,
} from './destination-selector.js';

/**
 * Placeholder until the experiments workstream ships weighted assignment.
 * It always serves the control, which is also the safe fallback.
 */
@Injectable()
export class ControlDestinationSelector extends DestinationSelector {
  select(target: RedirectTarget): SelectedDestination {
    return { destinationUrl: target.destinationUrl, variantId: null };
  }
}
