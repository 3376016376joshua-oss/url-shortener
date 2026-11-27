import { describe, expect, it } from 'vitest';
import { Link } from '../../src/database/entities/link.entity.js';
import { setUpAdminSuite } from './admin-suite.js';

describe('platform admin: links', () => {
  const suite = setUpAdminSuite();

  async function createLink(status: Link['status'] = 'ACTIVE'): Promise<Link> {
    return suite.dataSource.getRepository(Link).save({
      workspaceId: suite.tenant.workspace.id,
      domainId: suite.tenant.domain.id,
      code: 'launch1',
      destinationUrl: 'https://example.com/landing?token=secret',
      status,
    });
  }

  it('blocks a link, invalidates its suite.cache entry, and audits the action', async () => {
    const link = await createLink();

    const response = await suite.post(`/links/${link.id}/block`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: link.id, status: 'BLOCKED' });
    const stored = await suite.dataSource
      .getRepository(Link)
      .findOneByOrFail({ id: link.id });
    expect(stored.status).toBe('BLOCKED');
    expect(suite.cache.invalidateLink.mock.calls).toEqual([
      [suite.tenant.domain.hostname, 'launch1'],
    ]);
    expect(suite.audit.record.mock.calls).toEqual([
      [
        {
          workspaceId: suite.tenant.workspace.id,
          actor: { type: 'user', id: suite.admin.userId },
          action: 'link.blocked',
          target: { type: 'link', id: link.id },
          metadata: { hostname: suite.tenant.domain.hostname, code: 'launch1' },
        },
      ],
    ]);
  });

  it('blocks a link its workspace had disabled', async () => {
    const link = await createLink('DISABLED');

    const response = await suite.post(`/links/${link.id}/block`);

    expect(response.body).toEqual({ id: link.id, status: 'BLOCKED' });
  });

  it('unblocks a link back to active', async () => {
    const link = await createLink('BLOCKED');

    const response = await suite.post(`/links/${link.id}/unblock`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: link.id, status: 'ACTIVE' });
    expect(suite.cache.invalidateLink).toHaveBeenCalledWith(
      suite.tenant.domain.hostname,
      'launch1',
    );
    expect(suite.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'link.unblocked' }),
    );
  });

  it('does not re-enable a disabled link when asked to unblock it', async () => {
    const link = await createLink('DISABLED');

    const response = await suite.post(`/links/${link.id}/unblock`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: link.id, status: 'DISABLED' });
    expect(suite.cache.invalidateLink).not.toHaveBeenCalled();
    expect(suite.audit.record).not.toHaveBeenCalled();
  });

  it('blocking twice changes and audits once', async () => {
    const link = await createLink();

    await suite.post(`/links/${link.id}/block`);
    const again = await suite.post(`/links/${link.id}/block`);

    expect(again.status).toBe(200);
    expect(again.body).toEqual({ id: link.id, status: 'BLOCKED' });
    expect(suite.audit.record).toHaveBeenCalledTimes(1);
  });

  it('never puts the destination in the suite.audit entry', async () => {
    const link = await createLink();

    await suite.post(`/links/${link.id}/block`);

    expect(JSON.stringify(suite.audit.record.mock.calls)).not.toContain(
      'example.com',
    );
  });

  it('does not report success when the action cannot be audited', async () => {
    const link = await createLink();
    suite.audit.record.mockRejectedValue(new Error('audit store is down'));

    const response = await suite.post(`/links/${link.id}/block`);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
