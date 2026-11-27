import { describe, expect, it } from 'vitest';
import { normaliseHost } from './request-host.js';

describe('normaliseHost', () => {
  it.each([
    ['go.brand.com', 'go.brand.com'],
    ['GO.Brand.COM', 'go.brand.com'],
    ['go.brand.com.', 'go.brand.com'],
    ['localhost', 'localhost'],
    ['xn--bcher-kva.example', 'xn--bcher-kva.example'],
    ['127.0.0.1', '127.0.0.1'],
  ])('reads %s as %s', (hostname, expected) => {
    expect(normaliseHost(hostname)).toBe(expected);
  });

  it.each([
    ['a missing host', undefined],
    ['an empty host', ''],
    ['an IPv6 literal', '[::1]'],
    ['a host with a space', 'go brand.com'],
    ['a host with an underscore', 'go_brand.com'],
    ['a host with a path', 'go.brand.com/x'],
    ['a label that starts with a hyphen', '-go.brand.com'],
    ['an empty label', 'go..brand.com'],
    ['a host longer than 253 characters', `${'a'.repeat(63)}.`.repeat(4)],
    ['a host with a cache key separator', 'go.brand.com:launch'],
  ])('refuses %s', (_reason, hostname) => {
    expect(normaliseHost(hostname)).toBeNull();
  });
});
