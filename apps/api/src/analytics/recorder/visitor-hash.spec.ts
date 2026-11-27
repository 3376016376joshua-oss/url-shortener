import { describe, expect, it } from 'vitest';
import { hashVisitor } from './visitor-hash.js';

describe('hashVisitor', () => {
  it('gives one visitor the same hash for the whole day', () => {
    expect(hashVisitor('salt', '203.0.113.7', 'Firefox')).toBe(
      hashVisitor('salt', '203.0.113.7', 'Firefox'),
    );
  });

  it('tells visitors apart by address and by user agent', () => {
    const visitor = hashVisitor('salt', '203.0.113.7', 'Firefox');

    expect(hashVisitor('salt', '203.0.113.8', 'Firefox')).not.toBe(visitor);
    expect(hashVisitor('salt', '203.0.113.7', 'Safari')).not.toBe(visitor);
  });

  it('cannot be linked across days, because the salt changes', () => {
    expect(hashVisitor('monday', '203.0.113.7', 'Firefox')).not.toBe(
      hashVisitor('tuesday', '203.0.113.7', 'Firefox'),
    );
  });

  it('does not confuse where the address ends and the user agent starts', () => {
    expect(hashVisitor('salt', '10.0.0.1', '2 Firefox')).not.toBe(
      hashVisitor('salt', '10.0.0.12', ' Firefox'),
    );
  });

  it('accepts a visitor without a user agent', () => {
    expect(hashVisitor('salt', '203.0.113.7', null)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('contains neither the address nor the user agent', () => {
    const hash = hashVisitor('salt', '203.0.113.7', 'Firefox');

    expect(hash).not.toContain('203.0.113.7');
    expect(hash).not.toContain('Firefox');
  });
});
