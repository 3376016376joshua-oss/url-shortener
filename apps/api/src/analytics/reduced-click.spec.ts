import { describe, expect, it } from 'vitest';
import {
  fromStreamFields,
  toStreamFields,
  type ReducedClick,
} from './reduced-click.js';

const CLICK: ReducedClick = {
  eventId: '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e',
  clickedAt: new Date('2026-11-27T08:00:00.123Z'),
  linkId: '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a',
  variantId: '0193d2a1-0000-7d44-a1b2-c3d4e5f60718',
  source: 'qr',
  country: 'DE',
  deviceType: 'mobile',
  os: 'iOS',
  browser: 'Safari',
  referrerHost: 'news.example.com',
};

describe('click stream fields', () => {
  it('survives the round trip through a stream entry', () => {
    expect(fromStreamFields(toStreamFields(CLICK))).toEqual(CLICK);
  });

  it('keeps the control and a direct visit as absent values', () => {
    const direct = { ...CLICK, variantId: null, referrerHost: null };

    expect(toStreamFields(direct)).toMatchObject({
      variantId: '',
      referrerHost: '',
    });
    expect(fromStreamFields(toStreamFields(direct))).toEqual(direct);
  });

  it('holds exactly the reduced fields, so nothing personal can ride along', () => {
    expect(Object.keys(toStreamFields(CLICK)).sort()).toEqual([
      'browser',
      'clickedAt',
      'country',
      'deviceType',
      'eventId',
      'linkId',
      'os',
      'referrerHost',
      'source',
      'variantId',
    ]);
  });

  it.each([
    ['a missing field', { eventId: undefined }],
    ['an id that is not a UUID', { linkId: 'not-a-uuid' }],
    ['an unknown source', { source: 'email' }],
    ['an unknown device type', { deviceType: 'fridge' }],
    ['a country that is not two capitals', { country: 'deu' }],
    ['a time that is not milliseconds', { clickedAt: 'yesterday' }],
    ['an over-long browser name', { browser: 'b'.repeat(33) }],
  ])('rejects an entry with %s', (_reason, override) => {
    const fields = { ...toStreamFields(CLICK), ...override } as Record<
      string,
      string
    >;

    expect(fromStreamFields(fields)).toBeNull();
  });
});
