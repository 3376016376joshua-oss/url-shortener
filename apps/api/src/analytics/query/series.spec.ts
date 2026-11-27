import { describe, expect, it } from 'vitest';
import {
  dailySeries,
  hourlySeries,
  hourlyWindow,
  sumTotals,
} from './series.js';

describe('analytics series', () => {
  it('sums clicks and unique visitors over the days', () => {
    expect(
      sumTotals([
        { day: '2026-11-26', clicks: 310, uniqueVisitors: 240 },
        { day: '2026-11-27', clicks: 90, uniqueVisitors: 71 },
      ]),
    ).toEqual({ clicks: 400, uniqueVisitors: 311 });
  });

  it('totals nothing as zero', () => {
    expect(sumTotals([])).toEqual({ clicks: 0, uniqueVisitors: 0 });
  });

  it('fills days without clicks with zeros, oldest first', () => {
    const series = dailySeries({ from: '2026-11-25', to: '2026-11-27' }, [
      { day: '2026-11-26', clicks: 310, uniqueVisitors: 240 },
    ]);

    expect(series).toEqual([
      { bucket: '2026-11-25', clicks: 0, uniqueVisitors: 0 },
      { bucket: '2026-11-26', clicks: 310, uniqueVisitors: 240 },
      { bucket: '2026-11-27', clicks: 0, uniqueVisitors: 0 },
    ]);
  });

  it('covers whole UTC days in an hourly window', () => {
    expect(hourlyWindow({ from: '2026-11-26', to: '2026-11-27' })).toEqual({
      from: new Date('2026-11-26T00:00:00Z'),
      until: new Date('2026-11-28T00:00:00Z'),
    });
  });

  it('returns 24 points per day for an hourly series, without unique visitors', () => {
    const series = hourlySeries({ from: '2026-11-26', to: '2026-11-27' }, [
      { hour: new Date('2026-11-27T13:00:00Z'), clicks: 5 },
    ]);

    expect(series).toHaveLength(48);
    expect(series[0]).toEqual({
      bucket: '2026-11-26T00:00:00.000Z',
      clicks: 0,
    });
    expect(series[37]).toEqual({
      bucket: '2026-11-27T13:00:00.000Z',
      clicks: 5,
    });
    expect(series.at(-1)?.bucket).toBe('2026-11-27T23:00:00.000Z');
  });
});
