import { describe, expect, it } from 'vitest';
import type { Principal } from './principal.js';
import { requireWorkspaceRole } from './workspace-access.js';

const WORKSPACE = '0193d2a0-0000-7000-8000-000000000001';
const OTHER_WORKSPACE = '0193d2a0-0000-7000-8000-000000000002';

const principalWith = (role: 'owner' | 'admin' | 'member'): Principal => ({
  kind: 'session',
  userId: '0193d2a0-0000-7000-8000-0000000000aa',
  apiKeyId: null,
  isPlatformAdmin: false,
  memberships: [{ workspaceId: WORKSPACE, role }],
});

describe('requireWorkspaceRole', () => {
  it.each([
    ['member', 'member'],
    ['admin', 'member'],
    ['admin', 'admin'],
    ['owner', 'member'],
    ['owner', 'admin'],
    ['owner', 'owner'],
  ] as const)('lets a %s do what needs %s', (role, minimum) => {
    expect(requireWorkspaceRole(principalWith(role), WORKSPACE, minimum)).toBe(
      role,
    );
  });

  it.each([
    ['member', 'admin'],
    ['member', 'owner'],
    ['admin', 'owner'],
  ] as const)('refuses a %s what needs %s with 403', (role, minimum) => {
    const attempt = () =>
      requireWorkspaceRole(principalWith(role), WORKSPACE, minimum);

    expect(attempt).toThrow(expect.objectContaining({ status: 403 }) as Error);
  });

  it('answers 404, not 403, for a workspace the caller is not in', () => {
    const attempt = () =>
      requireWorkspaceRole(principalWith('owner'), OTHER_WORKSPACE, 'member');

    expect(attempt).toThrow(expect.objectContaining({ status: 404 }) as Error);
  });
});
