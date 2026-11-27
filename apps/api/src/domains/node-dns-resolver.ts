import { Resolver } from 'node:dns/promises';
import { Injectable } from '@nestjs/common';
import { DnsLookupError, DnsResolver } from './dns-resolver.js';

/** PRD section 13: no DNS lookup may hold a request or a job for longer. */
const DNS_LOOKUP_TIMEOUT_MS = 3_000;
/** One attempt, so the timeout above bounds the whole lookup. */
const DNS_LOOKUP_TRIES = 1;

/** The name does not exist, or has no record of the type asked for. */
const NO_RECORD_CODES: ReadonlySet<string> = new Set(['ENOTFOUND', 'ENODATA']);

function isNoRecord(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return typeof error.code === 'string' && NO_RECORD_CODES.has(error.code);
}

/** Asks the resolvers the host is configured with. */
@Injectable()
export class NodeDnsResolver extends DnsResolver {
  private readonly resolver = new Resolver({
    timeout: DNS_LOOKUP_TIMEOUT_MS,
    tries: DNS_LOOKUP_TRIES,
  });

  async resolveTxt(name: string): Promise<string[]> {
    const records = await this.answer(name, () =>
      this.resolver.resolveTxt(name),
    );
    return records.map((chunks) => chunks.join(''));
  }

  resolveCname(name: string): Promise<string[]> {
    return this.answer(name, () => this.resolver.resolveCname(name));
  }

  async resolveAddresses(name: string): Promise<string[]> {
    const [ipv4, ipv6] = await Promise.all([
      this.answer(name, () => this.resolver.resolve4(name)),
      this.answer(name, () => this.resolver.resolve6(name)),
    ]);
    return [...ipv4, ...ipv6];
  }

  private async answer<Record>(
    name: string,
    lookup: () => Promise<Record[]>,
  ): Promise<Record[]> {
    try {
      return await lookup();
    } catch (error) {
      if (isNoRecord(error)) {
        return [];
      }
      throw new DnsLookupError(name, error);
    }
  }
}
