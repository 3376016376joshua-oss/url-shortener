import { describe, expect, it } from 'vitest';
import type { ReducedClick } from '../reduced-click.js';
import { buildRollups } from './click-rollup.js';

const LINK_A = '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a';
const LINK_B = '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6b';
const VARIANT = '0193d2a1-0000-7d44-a1b2-c3d4e5f60718';

let sequence = 0;
const click = (overrides: Partial<ReducedClick> = {}): ReducedClick => {
  sequence += 1;
  return {
    eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    clickedAt: new Date('2026-11-27T12:00:00Z'),
    linkId: LINK_A,
    variantId: null,
    source: 'link',
    country: 'DE',
    deviceType: 'mobile',
    os: 'iOS',
    browser: 'Safari',
    referrerHost: null,
    ...overrides,
  };
};

describe('buildRollups', () => {
  it('adds nothing for an empty batch', () => {
    expect(buildRollups([])).toEqual({ totals: [], breakdowns: [], links: [] });
  });

  it('counts clicks per link and UTC day', () => {
    const rollups = buildRollups([
      click(),
      click(),
      click({ clickedAt: new Date('2026-11-28T00:00:00Z') }),
      click({ linkId: LINK_B }),
    ]);

    expect(rollups.totals).toEqual([
      { linkId: LINK_A, day: '2026-11-27', clicks: 2 },
      { linkId: LINK_A, day: '2026-11-28', clicks: 1 },
      { linkId: LINK_B, day: '2026-11-27', clicks: 1 },
    ]);
    expect(rollups.links).toEqual([
      { linkId: LINK_A, clicks: 3 },
      { linkId: LINK_B, clicks: 1 },
    ]);
  });

  it('counts one click once under each of the seven dimensions', () => {
    const { breakdowns } = buildRollups([
      click({ variantId: VARIANT, source: 'qr', referrerHost: 'example.com' }),
    ]);

    const byDimension = Object.fromEntries(
      breakdowns.map(({ dimension, value, clicks }) => [
        dimension,
        { value, clicks },
      ]),
    );
    expect(byDimension).toEqual({
      country: { value: 'DE', clicks: 1 },
      device: { value: 'mobile', clicks: 1 },
      os: { value: 'iOS', clicks: 1 },
      browser: { value: 'Safari', clicks: 1 },
      referrer: { value: 'example.com', clicks: 1 },
      source: { value: 'qr', clicks: 1 },
      variant: { value: VARIANT, clicks: 1 },
    });
  });

  it('reports the control and a direct visit by name', () => {
    const { breakdowns } = buildRollups([click()]);

    expect(breakdowns).toContainEqual(
      expect.objectContaining({ dimension: 'variant', value: 'control' }),
    );
    expect(breakdowns).toContainEqual(
      expect.objectContaining({ dimension: 'referrer', value: '(direct)' }),
    );
  });

  it('sums clicks that share a value', () => {
    const { breakdowns } = buildRollups([
      click({ country: 'DE' }),
      click({ country: 'DE' }),
      click({ country: 'FR' }),
    ]);

    const countries = breakdowns.filter(
      ({ dimension }) => dimension === 'country',
    );
    expect(countries).toEqual([
      expect.objectContaining({ value: 'DE', clicks: 2 }),
      expect.objectContaining({ value: 'FR', clicks: 1 }),
    ]);
  });

  it('leaves bots out of every count', () => {
    expect(buildRollups([click({ deviceType: 'bot' })])).toEqual({
      totals: [],
      breakdowns: [],
      links: [],
    });
  });

  it('orders rows the same way whatever order the clicks arrive in', () => {
    const batch = [
      click({ linkId: LINK_B, country: 'US' }),
      click({ linkId: LINK_A, country: 'FR' }),
      click({ linkId: LINK_A, country: 'DE' }),
    ];

    expect(buildRollups(batch)).toEqual(buildRollups([...batch].reverse()));
  });
});
