import { describe, expect, it } from 'vitest';
import type { Principal } from '../identity/principal.js';
import { toAuditActor } from './audit-actor.js';

const USER_ID = '0193d2a0-0000-7000-8000-000000000001';
const KEY_ID = '0193d2a0-0000-7000-8000-000000000002';

describe('toAuditActor', () => {
  it('names the user behind a session', () => {
    const principal: Principal = {
      kind: 'session',
      userId: USER_ID,
      apiKeyId: null,
      isPlatformAdmin: false,
      memberships: [],
    };

    expect(toAuditActor(principal)).toEqual({ type: 'user', id: USER_ID });
  });

  it('names the API key behind a key request', () => {
    const principal: Principal = {
      kind: 'api_key',
      userId: null,
      apiKeyId: KEY_ID,
      isPlatformAdmin: false,
      memberships: [],
    };

    expect(toAuditActor(principal)).toEqual({ type: 'api_key', id: KEY_ID });
  });
});
