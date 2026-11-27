import { describe, expect, it } from 'vitest';
import { createWorkspaceFixture } from '../support/fixtures.js';
import {
  Domain,
  DomainStatus,
} from '../../src/database/entities/domain.entity.js';
import { setUpAdminSuite } from './admin-suite.js';

describe('platform admin: domains', () => {
  const suite = setUpAdminSuite();

  async function createDomain(
    hostname: string,
    status: DomainStatus,
    workspaceId: string = suite.tenant.workspace.id,
  ): Promise<Domain> {
    return suite.dataSource.getRepository(Domain).save({
      workspaceId,
      hostname,
      status,
      verificationToken: `token-${workspaceId}`,
      ownershipVerified: true,
      routingVerified: true,
      verifiedAt: new Date(),
    });
  }

  it('blocks a custom domain, invalidates the host, and audits the action', async () => {
    const domain = await createDomain('go.brand.test', DomainStatus.Active);

    const response = await suite.post(`/domains/${domain.id}/block`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: domain.id,
      hostname: 'go.brand.test',
      status: 'BLOCKED',
    });
    expect(suite.cache.invalidateDomain.mock.calls).toEqual([
      ['go.brand.test'],
    ]);
    expect(suite.audit.record.mock.calls).toEqual([
      [
        {
          workspaceId: suite.tenant.workspace.id,
          actor: { type: 'user', id: suite.admin.userId },
          action: 'domain.blocked',
          target: { type: 'domain', id: domain.id },
          metadata: { hostname: 'go.brand.test' },
        },
      ],
    ]);
  });

  it('keeps every other claim from activating a blocked host', async () => {
    const other = await createWorkspaceFixture(suite.app);
    const blocked = await createDomain('go.brand.test', DomainStatus.Pending);
    const rival = await createDomain(
      'go.brand.test',
      DomainStatus.Pending,
      other.workspace.id,
    );
    await suite.post(`/domains/${blocked.id}/block`);

    const activation = suite.dataSource
      .getRepository(Domain)
      .update({ id: rival.id }, { status: DomainStatus.Active });

    await expect(activation).rejects.toThrow(/uq_domains_serving_hostname/);
  });

  it('refuses to block a claim while another claim serves the host', async () => {
    const other = await createWorkspaceFixture(suite.app);
    await createDomain(
      'go.brand.test',
      DomainStatus.Active,
      other.workspace.id,
    );
    const pending = await createDomain('go.brand.test', DomainStatus.Pending);

    const response = await suite.post(`/domains/${pending.id}/block`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'CONFLICT' });
    expect(suite.cache.invalidateDomain).not.toHaveBeenCalled();
  });

  it('refuses to block the platform domain', async () => {
    const response = await suite.post(
      `/domains/${suite.tenant.domain.id}/block`,
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'CONFLICT' });
    const stored = await suite.dataSource
      .getRepository(Domain)
      .findOneByOrFail({ id: suite.tenant.domain.id });
    expect(stored.status).toBe('ACTIVE');
  });

  it('unblocks a domain to pending, so it must prove its DNS again', async () => {
    const domain = await createDomain('go.brand.test', DomainStatus.Blocked);

    const response = await suite.post(`/domains/${domain.id}/unblock`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'PENDING' });
    const stored = await suite.dataSource
      .getRepository(Domain)
      .findOneByOrFail({ id: domain.id });
    expect(stored).toMatchObject({
      status: 'PENDING',
      ownershipVerified: false,
      routingVerified: false,
      failedChecks: 0,
      verifiedAt: null,
    });
    expect(suite.cache.invalidateDomain).toHaveBeenCalledWith('go.brand.test');
    expect(suite.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'domain.unblocked' }),
    );
  });

  it('leaves a domain that is not blocked alone when asked to unblock it', async () => {
    const domain = await createDomain('go.brand.test', DomainStatus.Active);

    const response = await suite.post(`/domains/${domain.id}/unblock`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ACTIVE' });
    expect(suite.audit.record).not.toHaveBeenCalled();
  });
});
