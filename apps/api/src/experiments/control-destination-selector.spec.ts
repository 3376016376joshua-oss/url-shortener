import { describe, expect, it } from 'vitest';
import { ControlDestinationSelector } from './control-destination-selector.js';

describe('ControlDestinationSelector', () => {
  it('serves the control even when variants exist', () => {
    const selected = new ControlDestinationSelector().select({
      linkId: '0193d2a0-0000-7000-8000-000000000001',
      destinationUrl: 'https://example.com/control',
      variants: [
        {
          id: '0193d2a0-0000-7000-8000-000000000002',
          destinationUrl: 'https://example.com/variant',
          weight: 50,
        },
      ],
    });

    expect(selected).toEqual({
      destinationUrl: 'https://example.com/control',
      variantId: null,
    });
  });
});
