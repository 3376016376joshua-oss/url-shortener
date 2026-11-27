import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QR_STYLE,
  contrastRatio,
  findQrStyleIssue,
  qrRenderQuerySchema,
  qrStyleInputSchema,
  qrStyleSchema,
} from './qr.js';

describe('contrastRatio', () => {
  it('is 21 for black on white, in either order', () => {
    expect(contrastRatio('000000', 'ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('ffffff', '000000')).toBeCloseTo(21, 5);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('3366cc', '3366cc')).toBe(1);
  });

  it('matches the WCAG reference value for mid grey on white', () => {
    // #767676 is the well-known lightest grey that passes 4.5:1 on white.
    expect(contrastRatio('767676', 'ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('findQrStyleIssue', () => {
  it('accepts a pair at or above 3:1', () => {
    expect(
      findQrStyleIssue({ foreground: '1a3c8f', background: 'ffffff' }),
    ).toBeNull();
  });

  it('names the problem for a pair below 3:1', () => {
    expect(
      findQrStyleIssue({ foreground: 'aaaaaa', background: 'ffffff' }),
    ).toMatch(/contrast ratio of at least 3:1/);
  });
});

describe('qrStyleInputSchema', () => {
  it('fills every option left out with its default', () => {
    expect(qrStyleInputSchema.parse({})).toEqual(DEFAULT_QR_STYLE);
  });

  it('keeps the options given and lowercases colours', () => {
    expect(
      qrStyleInputSchema.parse({
        foreground: '1A3C8F',
        margin: 0,
        errorCorrection: 'H',
      }),
    ).toEqual({
      foreground: '1a3c8f',
      background: 'ffffff',
      margin: 0,
      errorCorrection: 'H',
    });
  });

  it('refuses a low-contrast pair', () => {
    const result = qrStyleInputSchema.safeParse({
      foreground: 'eeeeee',
      background: 'ffffff',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['foreground']);
  });

  it('checks contrast against the default of the colour left out', () => {
    // White on the default white background.
    expect(qrStyleInputSchema.safeParse({ foreground: 'ffffff' }).success).toBe(
      false,
    );
  });

  it.each([
    ['a colour with a hash', { foreground: '#000000' }],
    ['a 3-digit colour', { foreground: '000' }],
    ['a margin above 16', { margin: 17 }],
    ['a negative margin', { margin: -1 }],
    ['a fractional margin', { margin: 1.5 }],
    ['an unknown error correction level', { errorCorrection: 'X' }],
    ['an unknown property', { size: 512 }],
  ])('refuses %s', (_reason, body) => {
    expect(qrStyleInputSchema.safeParse(body).success).toBe(false);
  });
});

describe('qrStyleSchema', () => {
  it('accepts a complete style', () => {
    expect(qrStyleSchema.parse(DEFAULT_QR_STYLE)).toEqual(DEFAULT_QR_STYLE);
  });

  it('refuses an incomplete style', () => {
    expect(qrStyleSchema.safeParse({ foreground: '000000' }).success).toBe(
      false,
    );
  });
});

describe('qrRenderQuerySchema', () => {
  it('accepts an empty query and adds nothing', () => {
    expect(qrRenderQuerySchema.parse({})).toEqual({});
  });

  it('reads numbers from query-string text', () => {
    expect(
      qrRenderQuerySchema.parse({
        format: 'png',
        size: '256',
        margin: '0',
        foreground: 'AB0000',
        background: 'ffffff',
        errorCorrection: 'Q',
      }),
    ).toEqual({
      format: 'png',
      size: 256,
      margin: 0,
      foreground: 'ab0000',
      background: 'ffffff',
      errorCorrection: 'Q',
    });
  });

  it.each([
    ['an unknown format', { format: 'gif' }],
    ['a size below 128', { size: '127' }],
    ['a size above 2048', { size: '2049' }],
    ['an empty size', { size: '' }],
    ['a size that is not a number', { size: '12px' }],
    ['a fractional size', { size: '256.5' }],
    ['a margin above 16', { margin: '17' }],
    ['a repeated parameter', { size: ['256', '512'] }],
    ['an unknown parameter', { colour: 'ff0000' }],
  ])('refuses %s', (_reason, query) => {
    expect(qrRenderQuerySchema.safeParse(query).success).toBe(false);
  });
});
