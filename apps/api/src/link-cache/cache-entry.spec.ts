import { describe, expect, it } from 'vitest';
import {
  NOT_FOUND_ENTRY,
  TOMBSTONE_ENTRY,
  decodeDomain,
  decodeLink,
  encodeDomain,
  encodeLink,
  type CachedLink,
} from './cache-entry.js';

const LINK: CachedLink = {
  id: '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e',
  domainId: '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a',
  destinationUrl: 'https://example.com/landing',
  status: 'ACTIVE',
  expiresAt: new Date('2026-12-01T00:00:00.000Z'),
  variants: [
    {
      id: '0193d2a1-0000-7d44-a1b2-c3d4e5f60718',
      destinationUrl: 'https://example.com/landing-b',
      weight: 30,
    },
  ],
};

const withField = (field: string, value: unknown): string =>
  JSON.stringify({ ...LINK, [field]: value });

describe('cache entries', () => {
  it('writes the markers the PRD names', () => {
    expect(NOT_FOUND_ENTRY).toBe('{"notFound":true}');
    expect(TOMBSTONE_ENTRY).toBe('{"invalidated":true}');
  });

  describe('a domain', () => {
    it('reads back what was written', () => {
      const domain = { id: LINK.domainId, status: 'BLOCKED' } as const;

      expect(decodeDomain(encodeDomain(domain))).toEqual({
        kind: 'hit',
        value: domain,
      });
    });

    it('reads back that no domain serves the host', () => {
      expect(decodeDomain(encodeDomain(null))).toEqual({ kind: 'not_found' });
    });

    it('does not trust a status it does not know', () => {
      const raw = JSON.stringify({ id: LINK.domainId, status: 'LIVE' });

      expect(decodeDomain(raw)).toEqual({ kind: 'unusable' });
    });
  });

  describe('a link', () => {
    it('reads back what was written, with its expiry as a date', () => {
      expect(decodeLink(encodeLink(LINK))).toEqual({
        kind: 'hit',
        value: LINK,
      });
    });

    it('reads back a link that never expires', () => {
      const link = { ...LINK, expiresAt: null };

      expect(decodeLink(encodeLink(link))).toEqual({
        kind: 'hit',
        value: link,
      });
    });

    it('reads back that the code does not exist', () => {
      expect(decodeLink(encodeLink(null))).toEqual({ kind: 'not_found' });
    });

    it('reports an absent key as a miss', () => {
      expect(decodeLink(null)).toEqual({ kind: 'miss' });
    });

    it('reports a tombstone as unusable, not as a miss', () => {
      expect(decodeLink(TOMBSTONE_ENTRY)).toEqual({ kind: 'unusable' });
    });

    it.each([
      ['text that is not JSON', 'not json'],
      ['JSON that is not an object', '"ACTIVE"'],
      ['null', 'null'],
      ['an unknown status', withField('status', 'EXPIRED')],
      ['an expiry that is not a time', withField('expiresAt', 'tomorrow')],
      ['no destination', withField('destinationUrl', '')],
      ['no domain', withField('domainId', undefined)],
      ['a marker that is not true', '{"notFound":"yes"}'],
    ])('reports %s as unusable', (_reason, raw) => {
      expect(decodeLink(raw)).toEqual({ kind: 'unusable' });
    });

    it.each([
      ['not a list', 'broken'],
      ['missing', undefined],
      ['a list with a malformed variant', [{ id: 'v1', weight: 'half' }]],
    ])('keeps the link and drops variants that are %s', (_reason, variants) => {
      expect(decodeLink(withField('variants', variants))).toEqual({
        kind: 'hit',
        value: { ...LINK, variants: [] },
      });
    });
  });
});
