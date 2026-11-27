import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInRange,
  eachDay,
  startOfUtcDay,
  utcDay,
} from './utc-day.js';

describe('UTC days', () => {
  it('takes the day of an instant in UTC, not in local time', () => {
    expect(utcDay(new Date('2026-11-27T23:59:59.999Z'))).toBe('2026-11-27');
    expect(utcDay(new Date('2026-11-28T00:00:00.000Z'))).toBe('2026-11-28');
  });

  it('starts a day at midnight UTC', () => {
    expect(startOfUtcDay('2026-11-27').toISOString()).toBe(
      '2026-11-27T00:00:00.000Z',
    );
  });

  it('adds days across month, year, and leap-day boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('counts both ends of a range', () => {
    expect(daysInRange('2026-11-27', '2026-11-27')).toBe(1);
    expect(daysInRange('2026-11-01', '2026-11-30')).toBe(30);
  });

  it('lists every day of a range, oldest first', () => {
    expect(eachDay('2026-11-29', '2026-12-01')).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ]);
  });

  it('lists nothing for a range that ends before it starts', () => {
    expect(eachDay('2026-12-01', '2026-11-29')).toEqual([]);
  });
});
