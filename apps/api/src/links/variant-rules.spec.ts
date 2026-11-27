import { describe, expect, it } from 'vitest';
import type { LinkVariant } from '../database/entities/link-variant.entity.js';
import {
  assertNotArchived,
  assertRoomForVariant,
  assertWeightsFit,
  toVariantResponse,
} from './variant-rules.js';

const variant = (overrides: Partial<LinkVariant> = {}): LinkVariant => ({
  id: '0193d2a1-0000-7d44-a1b2-c3d4e5f60718',
  linkId: '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e',
  name: 'Shorter headline',
  destinationUrl: 'https://example.com/landing-b',
  weight: 30,
  archivedAt: null,
  createdAt: new Date('2026-11-27T09:00:00.000Z'),
  updatedAt: new Date('2026-11-27T09:00:00.000Z'),
  ...overrides,
});

const codeOf = (action: () => void): unknown => {
  try {
    action();
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
  return null;
};

describe('variant rules', () => {
  it('presents a variant as the API resource', () => {
    expect(toVariantResponse(variant())).toEqual({
      id: '0193d2a1-0000-7d44-a1b2-c3d4e5f60718',
      name: 'Shorter headline',
      destinationUrl: 'https://example.com/landing-b',
      weight: 30,
      archivedAt: null,
      createdAt: '2026-11-27T09:00:00.000Z',
    });
  });

  it('has room for a fourth variant but not a fifth', () => {
    const three = [variant(), variant(), variant()];

    expect(codeOf(() => assertRoomForVariant(three))).toBeNull();
    expect(codeOf(() => assertRoomForVariant([...three, variant()]))).toBe(
      'QUOTA_EXCEEDED',
    );
  });

  it('lets weights sum to 99 and no further', () => {
    expect(codeOf(() => assertWeightsFit([]))).toBeNull();
    expect(codeOf(() => assertWeightsFit([50, 49]))).toBeNull();
    expect(codeOf(() => assertWeightsFit([50, 50]))).toBe('QUOTA_EXCEEDED');
  });

  it('refuses to change an archived variant', () => {
    expect(codeOf(() => assertNotArchived(variant()))).toBeNull();
    expect(
      codeOf(() => assertNotArchived(variant({ archivedAt: new Date() }))),
    ).toBe('CONFLICT');
  });
});
