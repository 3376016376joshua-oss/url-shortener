import { describe, expect, it } from 'vitest';
import {
  ENTRY_TTL_MS,
  NEGATIVE_TTL_MS,
  domainKey,
  linkKey,
  linkTtlMs,
} from './cache-policy.js';

const NOW = new Date('2026-11-27T08:00:00.000Z');
const after = (ms: number): Date => new Date(NOW.getTime() + ms);

describe('cache keys', () => {
  it('names a domain by its host', () => {
    expect(domainKey('go.brand.com')).toBe('domain:go.brand.com');
  });

  it('names a link by its host and code', () => {
    expect(linkKey('go.brand.com', 'launch')).toBe('link:go.brand.com:launch');
  });
});

describe('linkTtlMs', () => {
  it('keeps a link without an expiry for an hour', () => {
    expect(linkTtlMs(null, NOW)).toBe(ENTRY_TTL_MS);
  });

  it('keeps a link that expires later than that for an hour', () => {
    expect(linkTtlMs(after(2 * ENTRY_TTL_MS), NOW)).toBe(ENTRY_TTL_MS);
  });

  it('keeps a link that expires sooner only until it expires', () => {
    expect(linkTtlMs(after(90_000), NOW)).toBe(90_000);
    expect(linkTtlMs(after(1), NOW)).toBe(1);
  });

  it.each([
    ['at this instant', 0],
    ['a while ago', -86_400_000],
  ])('keeps a link that expired %s for 60 seconds', (_when, offset) => {
    expect(linkTtlMs(after(offset), NOW)).toBe(NEGATIVE_TTL_MS);
  });
});
