import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import type { Principal } from './principal.js';

const PRINCIPAL: Principal = {
  kind: 'api_key',
  userId: null,
  apiKeyId: '0193d2a0-0000-7000-8000-0000000000bb',
  isPlatformAdmin: false,
  memberships: [],
};

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const guardRecognising = (principal: Principal | null): AuthGuard =>
  new AuthGuard({ authenticate: () => Promise.resolve(principal) });

describe('AuthGuard', () => {
  it('lets an authenticated request through and attaches the principal', async () => {
    const request = {} as AuthenticatedRequest;

    const allowed = await guardRecognising(PRINCIPAL).canActivate(
      contextFor(request),
    );

    expect(allowed).toBe(true);
    expect(request.principal).toBe(PRINCIPAL);
  });

  it('answers 401 UNAUTHENTICATED when nobody is recognised', async () => {
    const attempt = guardRecognising(null).canActivate(
      contextFor({} as AuthenticatedRequest),
    );

    await expect(attempt).rejects.toMatchObject({
      status: 401,
      response: { code: 'UNAUTHENTICATED' },
    });
  });
});
