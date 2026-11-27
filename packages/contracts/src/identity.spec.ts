import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  identitySchema,
  signUpRequestSchema,
  updateProfileRequestSchema,
} from './identity.js';
import {
  auditLogQuerySchema,
  createApiKeyRequestSchema,
  createInvitationRequestSchema,
} from './workspaces.js';

const PASSWORD = 'correct horse battery';
const ID = '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e';

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it.each(['', 'ada', 'ada@', `${'a'.repeat(320)}@example.com`])(
    'rejects %j',
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('signUpRequestSchema', () => {
  const valid = { email: 'ada@example.com', name: ' Ada ', password: PASSWORD };

  it('accepts a sign-up and trims the name', () => {
    expect(signUpRequestSchema.parse(valid)).toEqual({ ...valid, name: 'Ada' });
  });

  it.each([
    ['11 characters', 'a'.repeat(11), false],
    ['12 characters', 'a'.repeat(12), true],
    ['128 characters', 'a'.repeat(128), true],
    ['129 characters', 'a'.repeat(129), false],
  ])('judges a password of %s', (_case, password, accepted) => {
    const result = signUpRequestSchema.safeParse({ ...valid, password });

    expect(result.success).toBe(accepted);
  });

  it('rejects unknown properties', () => {
    const result = signUpRequestSchema.safeParse({ ...valid, admin: true });

    expect(result.success).toBe(false);
  });
});

describe('updateProfileRequestSchema', () => {
  it.each([
    ['a name alone', { name: 'Ada' }, true],
    ['both passwords', { currentPassword: 'old', newPassword: PASSWORD }, true],
    ['nothing', {}, false],
    ['a new password alone', { newPassword: PASSWORD }, false],
    ['a current password alone', { currentPassword: 'old' }, false],
    [
      'a name with half a password change',
      { name: 'Ada', currentPassword: 'old' },
      false,
    ],
  ])('judges %s', (_case, body, accepted) => {
    expect(updateProfileRequestSchema.safeParse(body).success).toBe(accepted);
  });
});

describe('identitySchema', () => {
  const workspaces = [{ id: ID, name: 'Team', slug: 'team-1', role: 'owner' }];

  it('accepts a session identity and an API key identity', () => {
    const session = {
      kind: 'session',
      user: {
        id: ID,
        email: 'ada@example.com',
        name: 'Ada',
        isPlatformAdmin: false,
        createdAt: '2026-11-27T08:00:00.000Z',
      },
      workspaces,
    };
    const apiKey = {
      kind: 'api_key',
      apiKey: { id: ID, name: 'CI', keyPrefix: 'usk_abcdefgh' },
      workspaces,
    };

    expect(identitySchema.parse(session)).toEqual(session);
    expect(identitySchema.parse(apiKey)).toEqual(apiKey);
  });
});

describe('workspace request schemas', () => {
  it('lets an invitation grant admin or member, never owner', () => {
    const invite = (role: string) =>
      createInvitationRequestSchema.safeParse({ email: 'a@example.com', role })
        .success;

    expect([invite('admin'), invite('member'), invite('owner')]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('takes an API key expiry as an ISO timestamp, or none', () => {
    const parse = (expiresAt?: unknown) =>
      createApiKeyRequestSchema.safeParse({ name: 'CI', expiresAt }).success;

    expect(parse()).toBe(true);
    expect(parse(null)).toBe(true);
    expect(parse('2027-01-01T00:00:00Z')).toBe(true);
    expect(parse('tomorrow')).toBe(false);
  });

  it('pages the audit log 25 at a time by default, 100 at most', () => {
    expect(auditLogQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(auditLogQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(auditLogQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
