import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  DomainListResponse,
  DomainResponse,
} from '@url-shortener/contracts/domains';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { Response } from 'supertest';
import { vi, type Mock } from 'vitest';
import { AuditLog, type AuditEntry } from '../../src/audit/audit-log.js';
import { Domain } from '../../src/database/entities/domain.entity.js';
import { WorkspaceRole } from '../../src/database/entities/workspace-member.entity.js';
import { Clock } from '../../src/domains/clock.js';
import { DnsLookupError, DnsResolver } from '../../src/domains/dns-resolver.js';
import type { Principal } from '../../src/identity/principal.js';
import { LinkCacheInvalidator } from '../../src/link-cache/link-cache-invalidator.js';
import { createTestApp } from '../support/create-test-app.js';
import { authenticatedAs } from '../support/fixtures.js';
import { testEnv } from '../support/test-env.js';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const CNAME_TARGET = testEnv.CNAME_TARGET;
const CNAME_TARGET_ADDRESSES = ['203.0.113.10', '2001:db8::10'];

type Records = Map<string, string[]>;

/** An in-memory DNS a test publishes records in, as a domain's owner would. */
export class FakeDns extends DnsResolver {
  /** Every name asked for, in order. */
  readonly lookups: string[] = [];
  private readonly txt: Records = new Map();
  private readonly cname: Records = new Map();
  private readonly addresses: Records = new Map();
  private down = false;

  constructor() {
    super();
    this.reset();
  }

  reset(): void {
    this.lookups.length = 0;
    this.down = false;
    [this.txt, this.cname, this.addresses].forEach((map) => map.clear());
    this.addresses.set(CNAME_TARGET, CNAME_TARGET_ADDRESSES);
  }

  publishTxt(hostname: string, ...tokens: string[]): void {
    this.txt.set(`_shortener-challenge.${hostname}`, tokens);
  }

  publishCname(hostname: string, target = CNAME_TARGET): void {
    this.cname.set(hostname, [target]);
  }

  publishAddresses(hostname: string, addresses = CNAME_TARGET_ADDRESSES): void {
    this.addresses.set(hostname, addresses);
  }

  /** Both records a domain needs to become active. */
  publish(domain: { hostname: string; verificationToken: string }): void {
    this.publishTxt(domain.hostname, domain.verificationToken);
    this.publishCname(domain.hostname);
  }

  unpublish(hostname: string): void {
    this.txt.delete(`_shortener-challenge.${hostname}`);
    this.cname.delete(hostname);
    this.addresses.delete(hostname);
  }

  /** Makes every lookup fail, as when the resolver cannot be reached. */
  setDown(down: boolean): void {
    this.down = down;
  }

  resolveTxt(name: string): Promise<string[]> {
    return this.answer(name, this.txt);
  }

  resolveCname(name: string): Promise<string[]> {
    return this.answer(name, this.cname);
  }

  resolveAddresses(name: string): Promise<string[]> {
    return this.answer(name, this.addresses);
  }

  private answer(name: string, records: Records): Promise<string[]> {
    this.lookups.push(name);
    return this.down
      ? Promise.reject(new DnsLookupError(name, 'ETIMEOUT'))
      : Promise.resolve(records.get(name) ?? []);
  }
}

/** Starts at the real time, like the database, and only moves forward. */
export class FakeClock extends Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  reset(): void {
    this.offsetMs = 0;
  }
}

export interface DomainTestKit {
  app: NestExpressApplication;
  dns: FakeDns;
  clock: FakeClock;
  invalidateDomain: Mock<(hostname: string) => Promise<void>>;
  recordAudit: Mock<(entry: AuditEntry) => Promise<void>>;
  /** Who the next request is signed in as; `null` for nobody. */
  signIn(principal: Principal | null): void;
  /** Call between tests, along with `resetState`. */
  reset(): void;
}

type Customize = (builder: TestingModuleBuilder) => TestingModuleBuilder;

/**
 * Boots the application with DNS, the clock, the cache invalidator, and the
 * audit log replaced by ones a test can drive and inspect.
 */
export async function createDomainTestKit(
  customize: Customize = (builder) => builder,
): Promise<DomainTestKit> {
  const dns = new FakeDns();
  const clock = new FakeClock();
  const invalidateDomain = vi.fn<(hostname: string) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const recordAudit = vi.fn<(entry: AuditEntry) => Promise<void>>(() =>
    Promise.resolve(),
  );
  let principal: Principal | null = null;

  const app = await createTestApp((builder) =>
    customize(
      authenticatedAs(() => principal)(builder)
        .overrideProvider(DnsResolver)
        .useValue(dns)
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(LinkCacheInvalidator)
        .useValue({ invalidateDomain, invalidateLink: vi.fn() })
        .overrideProvider(AuditLog)
        .useValue({ record: recordAudit }),
    ),
  );
  return {
    app,
    dns,
    clock,
    invalidateDomain,
    recordAudit,
    signIn: (next) => {
      principal = next;
    },
    reset: () => {
      principal = null;
      dns.reset();
      clock.reset();
      invalidateDomain.mockClear();
      recordAudit.mockClear();
    },
  };
}

/** The same user, acting with another role in the same workspace. */
export function withRole(principal: Principal, role: WorkspaceRole): Principal {
  return {
    ...principal,
    memberships: principal.memberships.map((membership) => ({
      ...membership,
      role,
    })),
  };
}

/** A workspace API key: no user, and the member role in its one workspace. */
export function apiKeyFor(workspaceId: string): Principal {
  return {
    kind: 'api_key',
    userId: null,
    apiKeyId: '0193d2a0-0000-7000-8000-00000000a1b2',
    isPlatformAdmin: false,
    memberships: [{ workspaceId, role: WorkspaceRole.Member }],
  };
}

/** The stored row, for what the API does not return. */
export function findDomain(
  app: INestApplication,
  domainId: string,
): Promise<Domain> {
  return app.get(DataSource).getRepository(Domain).findOneByOrFail({
    id: domainId,
  });
}

/** Puts a domain in a state that would otherwise take hours of checks. */
export async function setDomain(
  app: INestApplication,
  domainId: string,
  values: Partial<Domain>,
): Promise<void> {
  await app
    .get(DataSource)
    .getRepository(Domain)
    .update({ id: domainId }, values);
}

/** The body of a response that returns one domain. */
export const domainOf = (response: Response): DomainResponse =>
  response.body as DomainResponse;

/** The body of the response that lists domains. */
export const domainListOf = (response: Response): DomainListResponse =>
  response.body as DomainListResponse;
