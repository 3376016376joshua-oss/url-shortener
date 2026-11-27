import { DataSource } from 'typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Domain,
  DomainStatus,
} from '../src/database/entities/domain.entity.js';
import { DomainVerificationJob } from '../src/domains/domain-verification.job.js';
import { PlatformDomainSeeder } from '../src/domains/platform-domain.seeder.js';
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  createDomainTestKit,
  domainOf,
  findDomain,
  setDomain,
  type DomainTestKit,
} from './domains/domain-test-kit.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from './support/fixtures.js';
import { resetState } from './support/reset-state.js';
import { testEnv } from './support/test-env.js';

const HOST = 'go.brand.com';
const SYSTEM = { type: 'system', id: null };

describe('scheduled domain checks', () => {
  let kit: DomainTestKit;
  let fixture: WorkspaceFixture;
  let job: DomainVerificationJob;

  const claim = async (hostname = HOST): Promise<Domain> => {
    const response = await request(kit.app.getHttpServer())
      .post(`/api/v1/workspaces/${fixture.workspace.id}/domains`)
      .send({ hostname });
    expect(response.status).toBe(201);
    return findDomain(kit.app, domainOf(response).id);
  };

  /** Runs the job and says whether it looked the domain up. */
  const runChecks = async (hostname = HOST): Promise<boolean> => {
    kit.dns.lookups.length = 0;
    await job.run();
    return kit.dns.lookups.includes(`_shortener-challenge.${hostname}`);
  };

  const activate = async (): Promise<Domain> => {
    const domain = await claim();
    kit.dns.publish(domain);
    kit.clock.advance(MINUTE_MS);
    await job.run();
    expect((await findDomain(kit.app, domain.id)).status).toBe('ACTIVE');
    kit.invalidateDomain.mockClear();
    kit.recordAudit.mockClear();
    return domain;
  };

  beforeAll(async () => {
    kit = await createDomainTestKit();
    job = kit.app.get(DomainVerificationJob);
  });

  beforeEach(async () => {
    await resetState(kit.app);
    kit.reset();
    fixture = await createWorkspaceFixture(kit.app);
    kit.signIn(fixture.principal);
  });

  afterAll(async () => {
    // The last tests rearrange the platform domain; leave nothing behind.
    await resetState(kit.app);
    await kit.app.close();
  });

  describe('a pending domain', () => {
    it('becomes active within a minute of its DNS being published', async () => {
      const domain = await claim();
      kit.dns.publish(domain);

      kit.clock.advance(MINUTE_MS);
      await job.run();

      expect(await findDomain(kit.app, domain.id)).toMatchObject({
        status: DomainStatus.Active,
        ownershipVerified: true,
        routingVerified: true,
      });
      expect(kit.invalidateDomain).toHaveBeenCalledWith(HOST);
      expect(kit.recordAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ actor: SYSTEM, action: 'domain.verified' }),
      );
    });

    it('is checked every minute for its first hour', async () => {
      await claim();

      expect(await runChecks()).toBe(false);
      kit.clock.advance(MINUTE_MS - 1_000);
      expect(await runChecks()).toBe(false);
      kit.clock.advance(1_000);
      expect(await runChecks()).toBe(true);
      expect(await runChecks()).toBe(false);
    });

    it('is checked hourly after its first hour', async () => {
      await claim();
      kit.clock.advance(HOUR_MS);
      expect(await runChecks()).toBe(true);

      kit.clock.advance(59 * MINUTE_MS);
      expect(await runChecks()).toBe(false);
      kit.clock.advance(MINUTE_MS);
      expect(await runChecks()).toBe(true);
    });

    it('becomes inactive after 72 hours without success', async () => {
      const domain = await claim();
      kit.clock.advance(71 * HOUR_MS);
      await job.run();
      expect((await findDomain(kit.app, domain.id)).status).toBe('PENDING');

      kit.clock.advance(HOUR_MS);
      await job.run();

      expect((await findDomain(kit.app, domain.id)).status).toBe('INACTIVE');
      expect(kit.recordAudit).toHaveBeenLastCalledWith({
        workspaceId: fixture.workspace.id,
        actor: SYSTEM,
        action: 'domain.deactivated',
        target: { type: 'domain', id: domain.id },
        metadata: { hostname: HOST, reason: 'never_verified' },
      });
      kit.clock.advance(DAY_MS);
      expect(await runChecks()).toBe(false);
    });
  });

  describe('an active domain', () => {
    it('is re-checked daily', async () => {
      await activate();

      kit.clock.advance(DAY_MS - MINUTE_MS);
      expect(await runChecks()).toBe(false);
      kit.clock.advance(MINUTE_MS);
      expect(await runChecks()).toBe(true);
      expect(await runChecks()).toBe(false);
    });

    it('is deactivated after three consecutive failed daily checks', async () => {
      const domain = await activate();
      kit.dns.unpublish(HOST);

      for (const failedChecks of [1, 2]) {
        kit.clock.advance(DAY_MS);
        await job.run();
        expect(await findDomain(kit.app, domain.id)).toMatchObject({
          status: DomainStatus.Active,
          failedChecks,
        });
      }
      expect(kit.invalidateDomain).not.toHaveBeenCalled();

      kit.clock.advance(DAY_MS);
      await job.run();

      expect(await findDomain(kit.app, domain.id)).toMatchObject({
        status: DomainStatus.Inactive,
        verifiedAt: null,
      });
      expect(kit.invalidateDomain).toHaveBeenCalledWith(HOST);
      expect(kit.recordAudit).toHaveBeenLastCalledWith({
        workspaceId: fixture.workspace.id,
        actor: SYSTEM,
        action: 'domain.deactivated',
        target: { type: 'domain', id: domain.id },
        metadata: { hostname: HOST, reason: 'dns_check_failed' },
      });
    });

    it('starts counting again after a check that passes', async () => {
      const domain = await activate();
      kit.dns.unpublish(HOST);
      for (let day = 0; day < 2; day += 1) {
        kit.clock.advance(DAY_MS);
        await job.run();
      }
      kit.dns.publish(domain);
      kit.clock.advance(DAY_MS);
      await job.run();
      kit.dns.unpublish(HOST);
      kit.clock.advance(DAY_MS);
      await job.run();

      expect(await findDomain(kit.app, domain.id)).toMatchObject({
        status: DomainStatus.Active,
        failedChecks: 1,
      });
    });

    it('is not failed by days when DNS cannot be asked', async () => {
      const domain = await activate();
      kit.dns.setDown(true);

      for (let day = 0; day < 4; day += 1) {
        kit.clock.advance(DAY_MS);
        expect(await runChecks()).toBe(true);
      }

      expect(await findDomain(kit.app, domain.id)).toMatchObject({
        status: DomainStatus.Active,
        failedChecks: 0,
      });
    });
  });

  it('never checks blocked, inactive, or platform domains', async () => {
    const blocked = await claim('blocked.brand.com');
    const inactive = await claim('inactive.brand.com');
    await setDomain(kit.app, blocked.id, { status: DomainStatus.Blocked });
    await setDomain(kit.app, inactive.id, { status: DomainStatus.Inactive });
    kit.clock.advance(30 * DAY_MS);
    kit.dns.lookups.length = 0;

    await job.run();

    expect(kit.dns.lookups).toEqual([]);
    expect((await findDomain(kit.app, fixture.domain.id)).status).toBe(
      'ACTIVE',
    );
  });

  it('checks every due domain in one run, however many there are', async () => {
    const domains = kit.app.get(DataSource).getRepository(Domain);
    await domains.insert(
      Array.from({ length: 250 }, (_unused, index) => ({
        workspaceId: fixture.workspace.id,
        hostname: `go${index}.brand.com`,
        verificationToken: `sv_${index}`,
      })),
    );
    kit.clock.advance(MINUTE_MS);

    await job.run();

    const unchecked = await domains
      .createQueryBuilder('domain')
      .where('domain.lastCheckedAt IS NULL')
      .andWhere('domain.workspaceId IS NOT NULL')
      .getCount();
    expect(unchecked).toBe(0);
  });

  describe('the platform domain', () => {
    const platformRows = (): Promise<Domain[]> =>
      kit.app
        .get(DataSource)
        .getRepository(Domain)
        .findBy({ hostname: testEnv.DEFAULT_SHORT_DOMAIN });

    it('is created at start-up when missing, active and without a workspace', async () => {
      await resetState(kit.app);
      const seeder = kit.app.get(PlatformDomainSeeder);

      await seeder.onApplicationBootstrap();
      await seeder.onApplicationBootstrap();

      const rows = await platformRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        workspaceId: null,
        status: DomainStatus.Active,
      });
      expect(rows[0]?.verifiedAt).toBeInstanceOf(Date);
      expect(kit.invalidateDomain).toHaveBeenCalledExactlyOnceWith(
        testEnv.DEFAULT_SHORT_DOMAIN,
      );
    });

    it('is created once when several replicas start together', async () => {
      await resetState(kit.app);
      const seeder = kit.app.get(PlatformDomainSeeder);

      await Promise.all(Array.from({ length: 5 }, () => seeder.seed()));

      expect(await platformRows()).toHaveLength(1);
    });

    it('refuses to start when a workspace already serves that host', async () => {
      await resetState(kit.app);
      fixture = await createWorkspaceFixture(kit.app);
      await setDomain(kit.app, fixture.domain.id, {
        workspaceId: fixture.workspace.id,
      });

      await expect(kit.app.get(PlatformDomainSeeder).seed()).rejects.toThrow(
        /already connected by a workspace/,
      );
    });
  });
});
