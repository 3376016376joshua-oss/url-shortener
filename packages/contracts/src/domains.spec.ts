import { describe, expect, it } from 'vitest';
import { createDomainRequestSchema, domainHostnameSchema } from './domains.js';

describe('domainHostnameSchema', () => {
  it.each([
    'go.brand.com',
    'brand.com',
    'a.b.c.brand.co.uk',
    'xn--bcher-kva.example.org',
    'my-links.brand.io',
    '1st.brand.com',
  ])('accepts %s', (hostname) => {
    expect(domainHostnameSchema.parse(hostname)).toBe(hostname);
  });

  it('stores the host name lowercase', () => {
    expect(domainHostnameSchema.parse('Go.Brand.COM')).toBe('go.brand.com');
  });

  it.each([
    ['an empty string', ''],
    ['a single label', 'intranet'],
    ['an IPv4 address', '203.0.113.10'],
    ['an IPv6 address', '2001:db8::1'],
    ['a bracketed IPv6 address', '[2001:db8::1]'],
    ['a URL', 'https://go.brand.com'],
    ['a host with a port', 'go.brand.com:8080'],
    ['a host with a path', 'go.brand.com/launch'],
    ['a trailing dot', 'go.brand.com.'],
    ['a wildcard', '*.brand.com'],
    ['an underscore', 'my_links.brand.com'],
    ['a label starting with a hyphen', '-go.brand.com'],
    ['a label ending with a hyphen', 'go-.brand.com'],
    ['an empty label', 'go..brand.com'],
    ['a label over 63 characters', `${'a'.repeat(64)}.brand.com`],
    ['a name over 253 characters', `${'a.'.repeat(126)}com`],
    ['a non-ASCII name', 'bücher.example.org'],
    ['surrounding whitespace', ' go.brand.com '],
    ['localhost', 'go.localhost'],
    ['a private top-level domain', 'links.internal'],
    ['a reserved top-level domain', 'go.brand.test'],
    ['a multicast DNS name', 'printer.local'],
  ])('rejects %s', (_reason, hostname) => {
    expect(domainHostnameSchema.safeParse(hostname).success).toBe(false);
  });
});

describe('createDomainRequestSchema', () => {
  it('rejects an unknown property', () => {
    const result = createDomainRequestSchema.safeParse({
      hostname: 'go.brand.com',
      status: 'ACTIVE',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing host name', () => {
    expect(createDomainRequestSchema.safeParse({}).success).toBe(false);
  });
});
