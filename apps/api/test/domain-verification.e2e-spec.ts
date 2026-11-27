import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainStatus } from '../src/database/entities/domain.entity.js';
import { DomainVerificationService } from '../src/domains/domain-verification.service.js';
import {
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

const HOST = 'go.brand.com';

interface Claim {
  id: string;
  hostname: string;
  verificationToken: string;
}

describe('domain verification', () => {
  let kit: DomainTestKit;
  let fixture: WorkspaceFixture;
  let other: WorkspaceFixture;

  const api = () => request(kit.app.getHttpServer());
  const domainsPath = (workspace: WorkspaceFixture) =>
    `/api/v1/workspaces/${workspace.workspace.id}/domains`;

  const claim = async (
    workspace = fixture,
    hostname = HOST,
  ): Promise<Claim> => {
    kit.signIn(workspace.principal);
    const response = await api()
      .post(domainsPath(workspace))
      .send({ hostname });
    expect(response.status).toBe(201);
    return findDomain(kit.app, domainOf(response).id);
  };

  /** Asks for a check once the one-a-minute limit no longer applies. */
  const verify = (domain: Claim, workspace = fixture): Promise<Response> => {
    kit.clock.advance(MINUTE_MS);
    kit.signIn(workspace.principal);
    return api().post(`${domainsPath(workspace)}/${domain.id}/verify`);
  };

  const statusOf = async (domain: Claim): Promise<DomainStatus> =>
    (await findDomain(kit.app, domain.id)).status;

  const recordsVerified = (response: Response): boolean[] =>
    domainOf(response).dnsRecords.map((record) => record.verified);

  beforeAll(async () => {
    kit = await createDomainTestKit();
  });

  beforeEach(async () => {
    await resetState(kit.app);
    kit.reset();
    fixture = await createWorkspaceFixture(kit.app);
    other = await createWorkspaceFixture(kit.app);
  });

  afterAll(async () => {
    await kit.app.close();
  });

  describe('the two DNS checks', () => {
    it('activates a domain once both records are published', async () => {
      const domain = await claim();
      kit.dns.publish(domain);

      const response = await verify(domain);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: domain.id, status: 'ACTIVE' });
      expect(recordsVerified(response)).toEqual([true, true]);
      expect(domainOf(response).verifiedAt).toBe(
        domainOf(response).lastCheckedAt,
      );
      expect(kit.invalidateDomain).toHaveBeenCalledWith(HOST);
    });

    it('stays pending with only the CNAME, and says which record passed', async () => {
      const domain = await claim();
      kit.dns.publishCname(HOST);

      const response = await verify(domain);

      expect(response.body).toMatchObject({
        status: 'PENDING',
        verifiedAt: null,
      });
      expect(recordsVerified(response)).toEqual([false, true]);
      expect(kit.invalidateDomain).not.toHaveBeenCalled();
    });

    it('stays pending with only the TXT record', async () => {
      const domain = await claim();
      kit.dns.publishTxt(HOST, domain.verificationToken);

      const response = await verify(domain);

      expect(response.body).toMatchObject({ status: 'PENDING' });
      expect(recordsVerified(response)).toEqual([true, false]);
    });

    it("activates an apex domain whose addresses are the platform's", async () => {
      const domain = await claim(fixture, 'brand.com');
      kit.dns.publishTxt('brand.com', domain.verificationToken);
      kit.dns.publishAddresses('brand.com');

      const response = await verify(domain);

      expect(response.body).toMatchObject({ status: 'ACTIVE' });
    });

    it('stays pending when the host points somewhere else', async () => {
      const domain = await claim();
      kit.dns.publishTxt(HOST, domain.verificationToken);
      kit.dns.publishCname(HOST, 'other.example.net');
      kit.dns.publishAddresses(HOST, ['198.51.100.7']);

      const response = await verify(domain);

      expect(response.body).toMatchObject({ status: 'PENDING' });
    });

    it('checks DNS when the domain is added', async () => {
      kit.dns.publishCname(HOST);
      kit.signIn(fixture.principal);

      const response = await api().post(domainsPath(fixture)).send({
        hostname: HOST,
      });

      expect(recordsVerified(response)).toEqual([false, true]);
      expect(kit.dns.lookups).toContain(`_shortener-challenge.${HOST}`);
    });

    it('records the verification, naming who asked for it', async () => {
      const domain = await claim();
      kit.dns.publish(domain);

      await verify(domain);

      expect(kit.recordAudit).toHaveBeenLastCalledWith({
        workspaceId: fixture.workspace.id,
        actor: { type: 'user', id: fixture.user.id },
        action: 'domain.verified',
        target: { type: 'domain', id: domain.id },
        metadata: { hostname: HOST },
      });
    });
  });

  describe('checks an admin asks for', () => {
    it('makes at most one check a minute', async () => {
      const domain = await claim();
      kit.dns.publish(domain);
      const path = `${domainsPath(fixture)}/${domain.id}/verify`;
      const lookupsAfterAdding = kit.dns.lookups.length;

      const tooSoon = await api().post(path);

      expect(tooSoon.status).toBe(200);
      expect(tooSoon.body).toMatchObject({ status: 'PENDING' });
      expect(kit.dns.lookups).toHaveLength(lookupsAfterAdding);

      kit.clock.advance(MINUTE_MS);
      const later = await api().post(path);

      expect(later.body).toMatchObject({ status: 'ACTIVE' });
    });

    it('reactivates an inactive domain at any time', async () => {
      const domain = await claim();
      await setDomain(kit.app, domain.id, { status: DomainStatus.Inactive });
      kit.dns.publish(domain);

      const response = await verify(domain);

      expect(response.body).toMatchObject({ status: 'ACTIVE' });
      expect(kit.invalidateDomain).toHaveBeenCalledWith(HOST);
    });

    it('leaves an inactive domain inactive while its DNS is wrong', async () => {
      const domain = await claim();
      await setDomain(kit.app, domain.id, { status: DomainStatus.Inactive });

      const response = await verify(domain);

      expect(response.body).toMatchObject({ status: 'INACTIVE' });
    });

    it('refuses to check a blocked domain, whatever its DNS says', async () => {
      const domain = await claim();
      await setDomain(kit.app, domain.id, { status: DomainStatus.Blocked });
      kit.dns.publish(domain);

      const response = await verify(domain);

      expect(response.status).toBe(409);
      expect(await statusOf(domain)).toBe(DomainStatus.Blocked);
    });

    it('changes nothing when DNS cannot be asked', async () => {
      const domain = await claim();
      kit.dns.publish(domain);
      await verify(domain);
      kit.dns.setDown(true);

      const response = await verify(domain);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'ACTIVE' });
      expect(recordsVerified(response)).toEqual([true, true]);
      expect((await findDomain(kit.app, domain.id)).failedChecks).toBe(0);
    });
  });

  describe('one host claimed by two workspaces', () => {
    it('activates only the claim whose token is published', async () => {
      const mine = await claim(fixture);
      const theirs = await claim(other);
      kit.dns.publish(mine);

      const theirAttempt = await verify(theirs, other);
      const myAttempt = await verify(mine, fixture);

      expect(theirAttempt.body).toMatchObject({ status: 'PENDING' });
      expect(recordsVerified(theirAttempt)).toEqual([false, true]);
      expect(myAttempt.body).toMatchObject({ status: 'ACTIVE' });
      expect(await statusOf(theirs)).toBe(DomainStatus.Pending);
      expect(JSON.stringify(theirAttempt.body)).not.toContain(mine.id);
      expect(JSON.stringify(theirAttempt.body)).not.toContain(
        mine.verificationToken,
      );
    });

    it('hands the host to a new owner and deactivates the previous one', async () => {
      const previous = await claim(fixture);
      kit.dns.publish(previous);
      await verify(previous, fixture);
      const next = await claim(other);
      kit.dns.publish(next);
      kit.invalidateDomain.mockClear();

      const response = await verify(next, other);

      expect(response.body).toMatchObject({ status: 'ACTIVE' });
      expect(await findDomain(kit.app, previous.id)).toMatchObject({
        status: DomainStatus.Inactive,
        verifiedAt: null,
      });
      expect(kit.invalidateDomain).toHaveBeenCalledWith(HOST);
      expect(kit.recordAudit).toHaveBeenCalledWith({
        workspaceId: fixture.workspace.id,
        actor: { type: 'system', id: null },
        action: 'domain.deactivated',
        target: { type: 'domain', id: previous.id },
        metadata: { hostname: HOST, reason: 'ownership_moved' },
      });
    });

    it('never activates a claim to a host that has since been blocked', async () => {
      const blocked = await claim(fixture);
      const mine = await claim(other);
      await setDomain(kit.app, blocked.id, { status: DomainStatus.Blocked });
      kit.dns.publish(mine);

      const response = await verify(mine, other);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'PENDING' });
      expect(await statusOf(blocked)).toBe(DomainStatus.Blocked);
    });

    it('lets only one of two claims verifying at once serve the host', async () => {
      const mine = await claim(fixture);
      const theirs = await claim(other);
      kit.dns.publishTxt(
        HOST,
        mine.verificationToken,
        theirs.verificationToken,
      );
      kit.dns.publishCname(HOST);
      kit.clock.advance(MINUTE_MS);
      const verification = kit.app.get(DomainVerificationService);

      await Promise.all(
        [mine, theirs].map((domain) =>
          verification.verify(domain.id, { type: 'system', id: null }),
        ),
      );

      const statuses = [await statusOf(mine), await statusOf(theirs)];
      expect(statuses.sort()).toEqual([
        DomainStatus.Active,
        DomainStatus.Inactive,
      ]);
    });
  });
});
