import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DestinationSelector,
  type RedirectTarget,
  type Visitor,
} from '../../src/experiments/destination-selector.js';
import { createTestApp } from '../support/create-test-app.js';

const VISITOR_COUNT = 10_000;
const CONTROL_URL = 'https://example.com/control';
const VARIANT = {
  id: '0193d2a1-0000-7000-8000-000000000002',
  destinationUrl: 'https://example.com/variant',
  weight: 30,
};
const TARGET: RedirectTarget = {
  linkId: '0193d2a0-0000-7000-8000-000000000001',
  destinationUrl: CONTROL_URL,
  variants: [VARIANT],
};

const visitorNumber = (index: number): Visitor => ({
  ip: `203.0.${Math.floor(index / 256)}.${index % 256}`,
  userAgent: 'Mozilla/5.0 (test)',
});

const selectorOf = (app: NestExpressApplication): DestinationSelector =>
  app.get(DestinationSelector, { strict: false });

/** The selector the redirect path injects, as the running application wires it. */
describe('DestinationSelector in the application', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives a 30% variant between 28% and 32% of 10,000 visitors (AC-34)', () => {
    const selector = selectorOf(app);
    let served = 0;
    for (let index = 0; index < VISITOR_COUNT; index += 1) {
      const selected = selector.select(TARGET, visitorNumber(index));
      if (selected.variantId === VARIANT.id) {
        expect(selected.destinationUrl).toBe(VARIANT.destinationUrl);
        served += 1;
      } else {
        expect(selected).toEqual({
          destinationUrl: CONTROL_URL,
          variantId: null,
        });
      }
    }

    expect(served / VISITOR_COUNT).toBeGreaterThanOrEqual(0.28);
    expect(served / VISITOR_COUNT).toBeLessThanOrEqual(0.32);
  });

  it('keeps a visitor on one destination across 100 requests and a restart (AC-35)', async () => {
    const visitors = Array.from({ length: 200 }, (_unused, index) =>
      visitorNumber(index),
    );
    const selector = selectorOf(app);
    const before = visitors.map((visitor) => selector.select(TARGET, visitor));
    for (let request = 0; request < 100; request += 1) {
      expect(selector.select(TARGET, visitors[0]!)).toEqual(before[0]);
    }

    const restarted = await createTestApp();
    try {
      const after = visitors.map((visitor) =>
        selectorOf(restarted).select(TARGET, visitor),
      );

      expect(after).toEqual(before);
    } finally {
      await restarted.close();
    }
  });

  it.each<[string, unknown]>([
    [
      'variants that sum past 99',
      [VARIANT, { ...VARIANT, id: `${VARIANT.id.slice(0, -1)}3`, weight: 70 }],
    ],
    ['malformed variants', [{ id: VARIANT.id, weight: 'thirty' }]],
    ['variants that are not a list', '[]'],
  ])(
    'sends every visitor to the control with %s (AC-36)',
    (_reason, variants) => {
      const selector = selectorOf(app);
      const target = { ...TARGET, variants } as RedirectTarget;

      for (let index = 0; index < 1_000; index += 1) {
        expect(selector.select(target, visitorNumber(index))).toEqual({
          destinationUrl: CONTROL_URL,
          variantId: null,
        });
      }
    },
  );
});
