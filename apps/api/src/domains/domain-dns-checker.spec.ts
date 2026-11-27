import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { DnsLookupError, DnsResolver } from './dns-resolver.js';
import { DomainDnsChecker } from './domain-dns-checker.js';

const HOST = 'go.brand.com';
const CHALLENGE = `_shortener-challenge.${HOST}`;
const TARGET = 'cname.sho.rt';
const TOKEN = 'sv_0123456789abcdef0123456789abcdef';
const TARGET_ADDRESSES = ['203.0.113.10', '203.0.113.11', '2001:db8::10'];

interface Zone {
  txt?: Record<string, string[]>;
  cname?: Record<string, string[]>;
  addresses?: Record<string, string[]>;
  failing?: string[];
}

class ZoneResolver extends DnsResolver {
  constructor(private readonly zone: Zone) {
    super();
  }

  resolveTxt(name: string): Promise<string[]> {
    return this.answer(name, this.zone.txt);
  }

  resolveCname(name: string): Promise<string[]> {
    return this.answer(name, this.zone.cname);
  }

  resolveAddresses(name: string): Promise<string[]> {
    return this.answer(name, this.zone.addresses);
  }

  private answer(
    name: string,
    records: Record<string, string[]> = {},
  ): Promise<string[]> {
    return this.zone.failing?.includes(name) === true
      ? Promise.reject(new DnsLookupError(name, 'ETIMEOUT'))
      : Promise.resolve(records[name] ?? []);
  }
}

const check = (zone: Zone) =>
  new DomainDnsChecker(new ZoneResolver(zone), {
    get: () => TARGET,
  } as unknown as ConfigService<Env, true>).check(HOST, TOKEN);

describe('DomainDnsChecker', () => {
  it('passes both checks with the TXT record and a CNAME to the target', async () => {
    await expect(
      check({ txt: { [CHALLENGE]: [TOKEN] }, cname: { [HOST]: [TARGET] } }),
    ).resolves.toEqual({ ownershipVerified: true, routingVerified: true });
  });

  it('fails both checks when nothing is published', async () => {
    await expect(check({})).resolves.toEqual({
      ownershipVerified: false,
      routingVerified: false,
    });
  });

  describe('ownership', () => {
    it('finds the token among other TXT values', async () => {
      const result = await check({
        txt: { [CHALLENGE]: ['sv_someone-else', ` ${TOKEN} `] },
      });

      expect(result.ownershipVerified).toBe(true);
    });

    it("is not proven by another claim's token", async () => {
      const result = await check({ txt: { [CHALLENGE]: ['sv_someone-else'] } });

      expect(result.ownershipVerified).toBe(false);
    });

    it('is not proven by a token published on the host itself', async () => {
      const result = await check({ txt: { [HOST]: [TOKEN] } });

      expect(result.ownershipVerified).toBe(false);
    });

    it('needs the whole token, in its exact case', async () => {
      const result = await check({
        txt: { [CHALLENGE]: [TOKEN.toUpperCase(), `${TOKEN}0`] },
      });

      expect(result.ownershipVerified).toBe(false);
    });
  });

  describe('routing', () => {
    const routed = async (zone: Zone): Promise<boolean> =>
      (await check(zone)).routingVerified;
    const target = { [TARGET]: TARGET_ADDRESSES };

    it('accepts a CNAME in any case, with or without the root dot', async () => {
      await expect(
        routed({ cname: { [HOST]: ['CNAME.Sho.rt.'] } }),
      ).resolves.toBe(true);
    });

    it('refuses a CNAME to another host', async () => {
      await expect(
        routed({
          cname: { [HOST]: ['other.example.net'] },
          addresses: { ...target, [HOST]: ['198.51.100.7'] },
        }),
      ).resolves.toBe(false);
    });

    it("accepts an apex whose addresses are all among the target's", async () => {
      await expect(
        routed({
          addresses: { ...target, [HOST]: ['203.0.113.11', '2001:db8::10'] },
        }),
      ).resolves.toBe(true);
    });

    it('accepts an alias chain that ends at the target', async () => {
      await expect(
        routed({
          cname: { [HOST]: ['edge.brand.com'] },
          addresses: { ...target, [HOST]: TARGET_ADDRESSES },
        }),
      ).resolves.toBe(true);
    });

    it('refuses addresses when even one is not the platform', async () => {
      await expect(
        routed({
          addresses: { ...target, [HOST]: ['203.0.113.10', '198.51.100.7'] },
        }),
      ).resolves.toBe(false);
    });

    it('refuses a host with no addresses, even if the target has none', async () => {
      await expect(routed({})).resolves.toBe(false);
    });
  });

  it.each([CHALLENGE, HOST, TARGET])(
    'reports a failed lookup of %s instead of guessing',
    async (failing) => {
      await expect(
        check({ txt: { [CHALLENGE]: [TOKEN] }, failing: [failing] }),
      ).rejects.toBeInstanceOf(DnsLookupError);
    },
  );
});
