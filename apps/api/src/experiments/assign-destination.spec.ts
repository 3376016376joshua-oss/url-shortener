import { describe, expect, it } from 'vitest';
import {
  BUCKET_COUNT,
  assignDestination,
  computeBucket,
} from './assign-destination.js';
import type {
  RedirectTarget,
  VariantTarget,
  Visitor,
} from './destination-selector.js';

const KEY = Buffer.from('a-test-key-that-is-32-bytes-long', 'utf8');
const LINK_ID = '0193d2a0-0000-7000-8000-000000000001';
const CONTROL_URL = 'https://example.com/control';
const VISITOR_COUNT = 10_000;

const variant = (suffix: string, weight: number): VariantTarget => ({
  id: `0193d2a1-0000-7000-8000-00000000000${suffix}`,
  destinationUrl: `https://example.com/variant-${suffix}`,
  weight,
});

const targetWith = (variants: unknown): RedirectTarget => ({
  linkId: LINK_ID,
  destinationUrl: CONTROL_URL,
  variants: variants as VariantTarget[],
});

const visitorNumber = (index: number): Visitor => ({
  // Spread over many networks, a few browsers each.
  ip: `10.${Math.floor(index / 65_536) % 256}.${Math.floor(index / 256) % 256}.${index % 256}`,
  userAgent: `Browser/${index % 7}`,
});

/** How many of the visitors land on each variant id, with `control` for none. */
function countAssignments(target: RedirectTarget): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < VISITOR_COUNT; index += 1) {
    const { variantId } = assignDestination(KEY, target, visitorNumber(index));
    const name = variantId ?? 'control';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

describe('computeBucket', () => {
  it('stays within the bucket range', () => {
    for (let index = 0; index < 1_000; index += 1) {
      const bucket = computeBucket(KEY, LINK_ID, visitorNumber(index));

      expect(Number.isInteger(bucket)).toBe(true);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(BUCKET_COUNT);
    }
  });

  it('depends on the link, the address, the user agent, and the key', () => {
    const visitor: Visitor = { ip: '203.0.113.7', userAgent: 'Browser/1' };
    const buckets = new Set([
      computeBucket(KEY, LINK_ID, visitor),
      computeBucket(KEY, `${LINK_ID.slice(0, -1)}2`, visitor),
      computeBucket(KEY, LINK_ID, { ...visitor, ip: '203.0.113.8' }),
      computeBucket(KEY, LINK_ID, { ...visitor, userAgent: 'Browser/2' }),
      computeBucket(Buffer.from('another-key'), LINK_ID, visitor),
    ]);

    expect(buckets.size).toBe(5);
  });

  it('does not confuse where one field ends and the next begins', () => {
    expect(
      computeBucket(KEY, LINK_ID, { ip: '1.2.3.4', userAgent: '5' }),
    ).not.toBe(computeBucket(KEY, LINK_ID, { ip: '1.2.3.45', userAgent: '' }));
  });

  it('treats a missing user agent as an empty one', () => {
    expect(
      computeBucket(KEY, LINK_ID, { ip: '1.2.3.4', userAgent: null }),
    ).toBe(computeBucket(KEY, LINK_ID, { ip: '1.2.3.4', userAgent: '' }));
  });
});

describe('assignDestination', () => {
  it('serves the control when the link has no variants', () => {
    expect(assignDestination(KEY, targetWith([]), visitorNumber(1))).toEqual({
      destinationUrl: CONTROL_URL,
      variantId: null,
    });
  });

  it('gives a 30% variant between 28% and 32% of 10,000 visitors (AC-34)', () => {
    const treatment = variant('a', 30);

    const counts = countAssignments(targetWith([treatment]));

    const share = (counts.get(treatment.id) ?? 0) / VISITOR_COUNT;
    expect(share).toBeGreaterThanOrEqual(0.28);
    expect(share).toBeLessThanOrEqual(0.32);
    expect(counts.get('control')).toBe(
      VISITOR_COUNT - (counts.get(treatment.id) ?? 0),
    );
  });

  it('splits four variants by weight and leaves the control the remainder', () => {
    const variants = [
      variant('a', 10),
      variant('b', 20),
      variant('c', 30),
      variant('d', 39),
    ];

    const counts = countAssignments(targetWith(variants));

    for (const { id, weight } of variants) {
      const share = (counts.get(id) ?? 0) / VISITOR_COUNT;
      expect(Math.abs(share - weight / 100)).toBeLessThan(0.02);
    }
    // The control's single percent: present, and small.
    expect(counts.get('control')).toBeGreaterThan(0);
    expect(counts.get('control')).toBeLessThan(VISITOR_COUNT * 0.03);
  });

  it('serves the destination of the variant it names', () => {
    const treatment = variant('a', 99);
    const served = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const selected = assignDestination(
        KEY,
        targetWith([treatment]),
        visitorNumber(index),
      );
      served.add(`${String(selected.variantId)} ${selected.destinationUrl}`);
    }

    expect(served).toEqual(
      new Set([
        `${treatment.id} ${treatment.destinationUrl}`,
        `null ${CONTROL_URL}`,
      ]),
    );
  });

  it('keeps one visitor on one destination across 100 requests (AC-35)', () => {
    const target = targetWith([variant('a', 50)]);
    const visitor: Visitor = { ip: '198.51.100.23', userAgent: 'Browser/3' };
    const first = assignDestination(KEY, target, visitor);

    for (let request = 0; request < 100; request += 1) {
      expect(assignDestination(KEY, target, visitor)).toEqual(first);
    }
  });

  it('does not depend on the order the variants arrive in', () => {
    const variants = [variant('a', 30), variant('b', 30), variant('c', 30)];
    const reversed = variants.toReversed();

    for (let index = 0; index < 500; index += 1) {
      const visitor = visitorNumber(index);
      expect(assignDestination(KEY, targetWith(reversed), visitor)).toEqual(
        assignDestination(KEY, targetWith(variants), visitor),
      );
    }
  });

  it('lays variants out in order of creation, oldest at the bottom', () => {
    const oldest = variant('a', 40);
    const newest = variant('b', 40);
    const target = targetWith([newest, oldest]);

    for (let index = 0; index < 500; index += 1) {
      const visitor = visitorNumber(index);
      const bucket = computeBucket(KEY, LINK_ID, visitor);
      const expected =
        bucket < 4_000 ? oldest.id : bucket < 8_000 ? newest.id : null;

      expect(assignDestination(KEY, target, visitor).variantId).toBe(expected);
    }
  });

  it("keeps a variant's visitors when a later variant is added", () => {
    const first = variant('a', 30);
    const before = targetWith([first]);
    const after = targetWith([first, variant('b', 20)]);

    for (let index = 0; index < 1_000; index += 1) {
      const visitor = visitorNumber(index);
      if (assignDestination(KEY, before, visitor).variantId === first.id) {
        expect(assignDestination(KEY, after, visitor).variantId).toBe(first.id);
      }
    }
  });

  describe('falls back to the control for every visitor (AC-36)', () => {
    const good = variant('a', 50);

    it.each<[string, unknown]>([
      ['weights that sum past 99', [variant('a', 50), variant('b', 50)]],
      ['a single weight of 100', [variant('a', 100)]],
      ['a weight of zero', [variant('a', 0)]],
      ['a negative weight', [good, variant('b', -10)]],
      ['a fractional weight', [variant('a', 12.5)]],
      ['a weight that is text', [{ ...good, weight: '50' }]],
      ['a weight that is not a number', [{ ...good, weight: Number.NaN }]],
      ['a variant without a destination', [{ id: good.id, weight: 50 }]],
      ['an empty destination', [{ ...good, destinationUrl: '' }]],
      ['a variant without an id', [{ ...good, id: undefined }]],
      ['a null entry among good ones', [good, null]],
      ['the same variant twice', [variant('a', 20), variant('a', 20)]],
      ['variants that are not a list', { 0: good }],
      ['variants that are text', 'not-a-list'],
      ['variants that are null', null],
      ['variants that are missing', undefined],
    ])('with %s', (_reason, variants) => {
      const target = targetWith(variants);

      for (let index = 0; index < 500; index += 1) {
        expect(assignDestination(KEY, target, visitorNumber(index))).toEqual({
          destinationUrl: CONTROL_URL,
          variantId: null,
        });
      }
    });

    it('when the visitor itself is malformed', () => {
      const broken = { ip: undefined, userAgent: 42 } as unknown as Visitor;
      const missing = undefined as unknown as Visitor;

      expect(() =>
        assignDestination(KEY, targetWith([good]), broken),
      ).not.toThrow();
      expect(assignDestination(KEY, targetWith([good]), missing)).toEqual({
        destinationUrl: CONTROL_URL,
        variantId: null,
      });
    });

    it('when reading a variant throws', () => {
      const explosive = new Proxy(good, {
        get: () => {
          throw new Error('corrupt cache entry');
        },
      });

      expect(
        assignDestination(KEY, targetWith([explosive]), visitorNumber(1)),
      ).toEqual({ destinationUrl: CONTROL_URL, variantId: null });
    });
  });
});
