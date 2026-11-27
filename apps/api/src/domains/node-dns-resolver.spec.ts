import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DnsLookupError } from './dns-resolver.js';
import { NodeDnsResolver } from './node-dns-resolver.js';

const lookups = vi.hoisted(() => ({
  resolveTxt: vi.fn(),
  resolveCname: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  options: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  Resolver: class {
    resolveTxt = lookups.resolveTxt;
    resolveCname = lookups.resolveCname;
    resolve4 = lookups.resolve4;
    resolve6 = lookups.resolve6;

    constructor(options: unknown) {
      lookups.options(options);
    }
  },
}));

const dnsError = (code: string): Error =>
  Object.assign(new Error(`query${code}`), { code });

describe('NodeDnsResolver', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('bounds every lookup to one attempt of three seconds', () => {
    new NodeDnsResolver();

    expect(lookups.options).toHaveBeenCalledWith({ timeout: 3_000, tries: 1 });
  });

  it('joins the character strings of each TXT record', async () => {
    lookups.resolveTxt.mockResolvedValue([['sv_', 'abc'], ['other']]);

    await expect(
      new NodeDnsResolver().resolveTxt('_shortener-challenge.go.brand.com'),
    ).resolves.toEqual(['sv_abc', 'other']);
  });

  it('returns the aliases of a name', async () => {
    lookups.resolveCname.mockResolvedValue(['cname.sho.rt']);

    await expect(
      new NodeDnsResolver().resolveCname('go.brand.com'),
    ).resolves.toEqual(['cname.sho.rt']);
  });

  it('returns IPv4 and IPv6 addresses together', async () => {
    lookups.resolve4.mockResolvedValue(['203.0.113.10']);
    lookups.resolve6.mockResolvedValue(['2001:db8::10']);

    await expect(
      new NodeDnsResolver().resolveAddresses('brand.com'),
    ).resolves.toEqual(['203.0.113.10', '2001:db8::10']);
  });

  it.each(['ENOTFOUND', 'ENODATA'])(
    'answers %s with no records',
    async (code) => {
      lookups.resolveTxt.mockRejectedValue(dnsError(code));
      lookups.resolveCname.mockRejectedValue(dnsError(code));
      lookups.resolve4.mockRejectedValue(dnsError(code));
      lookups.resolve6.mockResolvedValue(['2001:db8::10']);
      const resolver = new NodeDnsResolver();

      await expect(resolver.resolveTxt('go.brand.com')).resolves.toEqual([]);
      await expect(resolver.resolveCname('go.brand.com')).resolves.toEqual([]);
      await expect(resolver.resolveAddresses('go.brand.com')).resolves.toEqual([
        '2001:db8::10',
      ]);
    },
  );

  it.each(['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED'])(
    'reports %s as a lookup that could not be completed',
    async (code) => {
      lookups.resolveTxt.mockRejectedValue(dnsError(code));
      lookups.resolve4.mockRejectedValue(dnsError(code));
      lookups.resolve6.mockResolvedValue([]);
      const resolver = new NodeDnsResolver();

      await expect(resolver.resolveTxt('go.brand.com')).rejects.toBeInstanceOf(
        DnsLookupError,
      );
      await expect(
        resolver.resolveAddresses('go.brand.com'),
      ).rejects.toBeInstanceOf(DnsLookupError);
    },
  );
});
