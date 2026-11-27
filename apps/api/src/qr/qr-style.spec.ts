import { DEFAULT_QR_STYLE, type QrStyle } from '@url-shortener/contracts/qr';
import { describe, expect, it } from 'vitest';
import {
  isDefaultStyle,
  parseSavedStyle,
  resolveRenderOptions,
} from './qr-style.js';

const SAVED: QrStyle = {
  foreground: '1a3c8f',
  background: 'fff8e7',
  margin: 2,
  errorCorrection: 'H',
};

describe('parseSavedStyle', () => {
  it('reads a stored style', () => {
    expect(parseSavedStyle({ ...SAVED })).toEqual(SAVED);
  });

  it.each([
    ['nothing stored', null],
    ['an incomplete style', { foreground: '000000' }],
    ['a style with an invalid option', { ...SAVED, margin: 99 }],
    ['something that is not an object', 'blue'],
  ])('is null for %s', (_reason, stored) => {
    expect(parseSavedStyle(stored)).toBeNull();
  });
});

describe('isDefaultStyle', () => {
  it('recognises the defaults', () => {
    expect(isDefaultStyle({ ...DEFAULT_QR_STYLE })).toBe(true);
  });

  it.each<Partial<QrStyle>>([
    { foreground: '111111' },
    { background: 'eeeeee' },
    { margin: 0 },
    { errorCorrection: 'L' },
  ])('is false when %o differs', (difference) => {
    expect(isDefaultStyle({ ...DEFAULT_QR_STYLE, ...difference })).toBe(false);
  });
});

describe('resolveRenderOptions', () => {
  it('uses the defaults without a saved style or a query', () => {
    expect(resolveRenderOptions(null, {})).toEqual({
      format: 'svg',
      size: 512,
      foreground: '000000',
      background: 'ffffff',
      margin: 4,
      errorCorrection: 'M',
    });
  });

  it('uses the saved style', () => {
    expect(resolveRenderOptions(SAVED, {})).toEqual({
      format: 'svg',
      size: 512,
      ...SAVED,
    });
  });

  it('lets each query parameter override its option only', () => {
    expect(
      resolveRenderOptions(SAVED, {
        format: 'png',
        size: 256,
        foreground: '000000',
        margin: 0,
      }),
    ).toEqual({
      format: 'png',
      size: 256,
      foreground: '000000',
      background: SAVED.background,
      margin: 0,
      errorCorrection: SAVED.errorCorrection,
    });
  });
});
