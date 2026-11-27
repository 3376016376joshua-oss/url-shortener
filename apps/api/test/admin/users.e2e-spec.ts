import { describe, expect, it } from 'vitest';
import { Session } from '../../src/database/entities/session.entity.js';
import { User } from '../../src/database/entities/user.entity.js';
import { setUpAdminSuite } from './admin-suite.js';

describe('platform admin: users', () => {
  const suite = setUpAdminSuite();

  async function signIn(userId: string, token: string): Promise<void> {
    await suite.dataSource.getRepository(Session).save({
      userId,
      tokenHash: Buffer.from(token),
      expiresAt: new Date(Date.now() + 60_000),
    });
  }

  it('disables an account and signs it out everywhere', async () => {
    await signIn(suite.tenant.user.id, 'laptop');
    await signIn(suite.tenant.user.id, 'phone');
    await signIn(suite.admin.userId ?? '', 'operator');

    const response = await suite.post(`/users/${suite.tenant.user.id}/disable`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: suite.tenant.user.id,
      disabledAt: expect.any(String) as string,
    });
    const stored = await suite.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: suite.tenant.user.id });
    expect(stored.disabledAt).toBeInstanceOf(Date);
    const sessions = await suite.dataSource.getRepository(Session).find();
    expect(sessions.map((session) => session.userId)).toEqual([
      suite.admin.userId,
    ]);
    expect(suite.audit.record.mock.calls).toEqual([
      [
        {
          workspaceId: null,
          actor: { type: 'user', id: suite.admin.userId },
          action: 'user.disabled',
          target: { type: 'user', id: suite.tenant.user.id },
        },
      ],
    ]);
  });

  it('disabling twice audits once and keeps the first timestamp', async () => {
    const first = await suite.post(`/users/${suite.tenant.user.id}/disable`);
    const second = await suite.post(`/users/${suite.tenant.user.id}/disable`);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(suite.audit.record).toHaveBeenCalledTimes(1);
  });

  it('enables a disabled account', async () => {
    await suite.post(`/users/${suite.tenant.user.id}/disable`);

    const response = await suite.post(`/users/${suite.tenant.user.id}/enable`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: suite.tenant.user.id,
      disabledAt: null,
    });
    expect(suite.audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'user.enabled' }),
    );
  });

  it('refuses to let an suite.admin disable their own account', async () => {
    const response = await suite.post(`/users/${suite.admin.userId}/disable`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'CONFLICT' });
  });
});
