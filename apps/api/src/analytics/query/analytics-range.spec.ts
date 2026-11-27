import { describe, expect, it } from 'vitest';
import { ApiException } from '../../common/errors/api-exception.js';
import { resolveRange, type RangeRequest } from './analytics-range.js';

const NOW = new Date('2026-11-27T15:30:00Z');

const refusal = (request: RangeRequest): unknown => {
  try {
    resolveRange(request, NOW);
  } catch (error) {
    return error instanceof ApiException ? error.getResponse() : error;
  }
  return null;
};

describe('resolveRange', () => {
  it('defaults to the last 30 days, ending today in UTC', () => {
    expect(resolveRange({}, NOW)).toEqual({
      from: '2026-10-29',
      to: '2026-11-27',
      interval: 'day',
    });
  });

  it('counts 30 days back from an explicit end', () => {
    expect(resolveRange({ to: '2026-06-30' }, NOW)).toMatchObject({
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('ends today when only the start is given', () => {
    expect(resolveRange({ from: '2026-11-01' }, NOW)).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-27',
    });
  });

  it('accepts a single day', () => {
    expect(
      resolveRange({ from: '2026-11-27', to: '2026-11-27' }, NOW),
    ).toMatchObject({ from: '2026-11-27', to: '2026-11-27' });
  });

  it('refuses a range that ends before it starts', () => {
    expect(refusal({ from: '2026-11-27', to: '2026-11-26' })).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
    });
  });

  it('accepts a daily range of years, up to the stated bound', () => {
    expect(
      resolveRange({ from: '2020-01-01', to: '2026-11-27' }, NOW).from,
    ).toBe('2020-01-01');
    expect(refusal({ from: '2010-01-01', to: '2026-11-27' })).toMatchObject({
      statusCode: 400,
    });
  });

  it('accepts an hourly range of exactly 7 days', () => {
    expect(
      resolveRange(
        { from: '2026-11-21', to: '2026-11-27', interval: 'hour' },
        NOW,
      ),
    ).toEqual({ from: '2026-11-21', to: '2026-11-27', interval: 'hour' });
  });

  it('refuses an hourly range of 8 days', () => {
    expect(
      refusal({ from: '2026-11-20', to: '2026-11-27', interval: 'hour' }),
    ).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });

  it('refuses the default 30 day range for an hourly series', () => {
    expect(refusal({ interval: 'hour' })).toMatchObject({ statusCode: 400 });
  });

  it('serves an hourly range at the edge of retention and refuses one past it', () => {
    expect(
      resolveRange(
        { from: '2026-08-29', to: '2026-08-30', interval: 'hour' },
        NOW,
      ).from,
    ).toBe('2026-08-29');
    expect(
      refusal({ from: '2026-08-28', to: '2026-08-30', interval: 'hour' }),
    ).toMatchObject({ statusCode: 400 });
  });
});
