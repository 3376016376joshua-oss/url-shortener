import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema.js';
import type { RedirectTarget, Visitor } from './destination-selector.js';
import {
  WeightedDestinationSelector,
  deriveAssignmentKey,
} from './weighted-destination-selector.js';

const SECRET = 'a-secret-that-is-at-least-32-characters';
const OTHER_SECRET = 'another-secret-of-at-least-32-characters';

const TARGET: RedirectTarget = {
  linkId: '0193d2a0-0000-7000-8000-000000000001',
  destinationUrl: 'https://example.com/control',
  variants: [
    {
      id: '0193d2a1-0000-7000-8000-000000000002',
      destinationUrl: 'https://example.com/variant',
      weight: 50,
    },
  ],
};

const visitorNumber = (index: number): Visitor => ({
  ip: `192.0.2.${index % 256}`,
  userAgent: `Browser/${Math.floor(index / 256)}`,
});

function selectorFor(appSecret: string): WeightedDestinationSelector {
  const config = { get: () => appSecret } as unknown as ConfigService<
    Env,
    true
  >;
  return new WeightedDestinationSelector(config);
}

function assignments(selector: WeightedDestinationSelector): string[] {
  return Array.from({ length: 1_000 }, (_unused, index) =>
    String(selector.select(TARGET, visitorNumber(index)).variantId),
  );
}

describe('deriveAssignmentKey', () => {
  it('is 32 bytes, stable for a secret, and different per secret', () => {
    const key = deriveAssignmentKey(SECRET);

    expect(key).toHaveLength(32);
    expect(deriveAssignmentKey(SECRET).equals(key)).toBe(true);
    expect(deriveAssignmentKey(OTHER_SECRET).equals(key)).toBe(false);
  });

  it('is not the secret itself', () => {
    expect(deriveAssignmentKey(SECRET).toString('utf8')).not.toContain(SECRET);
  });
});

describe('WeightedDestinationSelector', () => {
  it('assigns every visitor the same way after a restart (AC-35)', () => {
    const beforeRestart = assignments(selectorFor(SECRET));
    const afterRestart = assignments(selectorFor(SECRET));

    expect(afterRestart).toEqual(beforeRestart);
    expect(new Set(beforeRestart).size).toBe(2);
  });

  it('assigns differently under a different secret', () => {
    expect(assignments(selectorFor(OTHER_SECRET))).not.toEqual(
      assignments(selectorFor(SECRET)),
    );
  });

  it('serves the control for a link without a test', () => {
    const selected = selectorFor(SECRET).select(
      { ...TARGET, variants: [] },
      visitorNumber(1),
    );

    expect(selected).toEqual({
      destinationUrl: TARGET.destinationUrl,
      variantId: null,
    });
  });
});
