import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../identity/principal.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

function contextFor(principal: Principal | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  } as unknown as ExecutionContext;
}

const admin: Principal = {
  kind: 'session',
  userId: '0198c0de-0000-7000-8000-000000000001',
  apiKeyId: null,
  isPlatformAdmin: true,
  memberships: [],
};

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('lets a signed-in platform admin through', () => {
    expect(guard.canActivate(contextFor(admin))).toBe(true);
  });

  it.each([
    ['an ordinary user', { ...admin, isPlatformAdmin: false }],
    [
      'an API key, even one flagged as admin',
      { ...admin, kind: 'api_key' as const, userId: null, apiKeyId: 'key' },
    ],
    ['a request nobody authenticated', undefined],
  ])('refuses %s with 403 FORBIDDEN', (_who, principal) => {
    expect(() => guard.canActivate(contextFor(principal))).toThrowError(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({ code: 'FORBIDDEN' }) as unknown,
      }) as Error,
    );
  });
});
