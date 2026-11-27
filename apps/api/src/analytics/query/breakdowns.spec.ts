import { describe, expect, it } from 'vitest';
import { toBreakdowns, type RankedValue } from './breakdowns.js';

const ranked = (
  dimension: RankedValue['dimension'],
  dimensionClicks: number,
  values: Array<[string, number]>,
): RankedValue[] =>
  values.map(([value, clicks]) => ({
    dimension,
    value,
    clicks,
    dimensionClicks,
  }));

describe('toBreakdowns', () => {
  it('returns every dimension, empty when it has no clicks', () => {
    expect(toBreakdowns([])).toEqual({
      country: [],
      device: [],
      os: [],
      browser: [],
      referrer: [],
      source: [],
      variant: [],
    });
  });

  it('lists the top values and sums the rest as other', () => {
    const { country } = toBreakdowns(
      ranked('country', 1284, [
        ['DE', 512],
        ['FR', 400],
        ['US', 275],
      ]),
    );

    expect(country).toEqual([
      { value: 'DE', clicks: 512 },
      { value: 'FR', clicks: 400 },
      { value: 'US', clicks: 275 },
      { value: 'other', clicks: 97 },
    ]);
  });

  it('adds no other entry when the top values are everything', () => {
    const { source } = toBreakdowns(
      ranked('source', 10, [
        ['link', 7],
        ['qr', 3],
      ]),
    );

    expect(source).toEqual([
      { value: 'link', clicks: 7 },
      { value: 'qr', clicks: 3 },
    ]);
  });

  it('folds the remainder into a real value that is itself called other', () => {
    const { device } = toBreakdowns(
      ranked('device', 20, [
        ['mobile', 10],
        ['other', 6],
      ]),
    );

    expect(device).toEqual([
      { value: 'mobile', clicks: 10 },
      { value: 'other', clicks: 10 },
    ]);
  });

  it('keeps dimensions apart', () => {
    const breakdowns = toBreakdowns([
      ...ranked('os', 3, [['iOS', 3]]),
      ...ranked('browser', 3, [['Safari', 3]]),
    ]);

    expect(breakdowns.os).toEqual([{ value: 'iOS', clicks: 3 }]);
    expect(breakdowns.browser).toEqual([{ value: 'Safari', clicks: 3 }]);
  });
});
