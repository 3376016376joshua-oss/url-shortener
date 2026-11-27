import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import {
  generateApiKey,
  isWellFormedApiKey,
  readBearerToken,
} from './api-keys/api-key-format.js';
import { assertSameOrigin } from './origin-check.js';
import type { Principal } from './principal.js';
import {
  requireUserSession,
  requireUserWithWorkspaceRole,
} from './require-user-session.js';
import { readSessionToken } from './sessions/session-cookie.js';
import {
  generateSecretToken,
  hashSecret,
  randomBase62,
} from './tokens/secret-token.js';

const APP_URL = 'https://app.sho.test';
const WORKSPACE = '0193d2a0-0000-7000-8000-000000000001';

const requestWith = (
  headers: Record<string, string>,
  method = 'GET',
): Request => ({ headers, method }) as unknown as Request;

const principal = (kind: 'session' | 'api_key'): Principal => ({
  kind,
  userId: kind === 'session' ? '0193d2a0-0000-7000-8000-0000000000aa' : null,
  apiKeyId: kind === 'api_key' ? '0193d2a0-0000-7000-8000-0000000000bb' : null,
  isPlatformAdmin: false,
  memberships: [{ workspaceId: WORKSPACE, role: 'member' }],
});

describe('secret tokens', () => {
  it('generates 256-bit, URL-safe, unique tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateSecretToken));

    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('hashes with SHA-256', () => {
    expect(hashSecret('abc').toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('draws Base62 characters only, and uses the whole alphabet', () => {
    const sample = randomBase62(5_000);

    expect(sample).toMatch(/^[0-9A-Za-z]{5000}$/);
    expect(new Set(sample).size).toBe(62);
  });
});

describe('API key format', () => {
  it('generates usk_ plus 40 Base62 characters, a 12 character prefix, and the hash', () => {
    const { key, keyPrefix, keyHash } = generateApiKey();

    expect(key).toMatch(/^usk_[0-9A-Za-z]{40}$/);
    expect(keyPrefix).toBe(key.slice(0, 12));
    expect(keyHash).toEqual(hashSecret(key));
    expect(isWellFormedApiKey(key)).toBe(true);
  });

  it.each(['usk_short', `usk_${'a'.repeat(41)}`, `key_${'a'.repeat(40)}`, ''])(
    'does not take %j for a key',
    (value) => {
      expect(isWellFormedApiKey(value)).toBe(false);
    },
  );

  it.each([
    ['Bearer abc123', 'abc123'],
    ['bearer   abc123', 'abc123'],
    ['Basic abc123', null],
    ['Bearer', null],
    ['Bearer two tokens', null],
  ])('reads %j as bearer token %j', (authorization, expected) => {
    expect(readBearerToken(requestWith({ authorization }))).toBe(expected);
  });

  it('reads no bearer token without the header', () => {
    expect(readBearerToken(requestWith({}))).toBeNull();
  });
});

describe('readSessionToken', () => {
  it.each([
    ['session=abc', 'abc'],
    ['theme=dark; session=abc; other=1', 'abc'],
    ['theme=dark;session=abc', 'abc'],
    ['session=', null],
    ['xsession=abc', null],
    ['theme=dark', null],
    ['garbage', null],
  ])('reads %j as %j', (cookie, expected) => {
    expect(readSessionToken(requestWith({ cookie }))).toBe(expected);
  });

  it('reads nothing without a Cookie header', () => {
    expect(readSessionToken(requestWith({}))).toBeNull();
  });
});

describe('assertSameOrigin', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets a %s through without an Origin',
    (method) => {
      expect(() =>
        assertSameOrigin(requestWith({}, method), APP_URL),
      ).not.toThrow();
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'lets a %s through when the Origin is the app',
    (method) => {
      expect(() =>
        assertSameOrigin(requestWith({ origin: APP_URL }, method), APP_URL),
      ).not.toThrow();
    },
  );

  it.each([
    ['no Origin', {}],
    ['another site', { origin: 'https://evil.example' }],
    ['a subdomain of the app', { origin: 'https://x.app.sho.test' }],
    ['the app on another port', { origin: `${APP_URL}:8443` }],
    ['an opaque origin', { origin: 'null' }],
  ])('refuses a POST with %s with 403 FORBIDDEN', (_case, headers) => {
    expect(() =>
      assertSameOrigin(requestWith(headers, 'POST'), APP_URL),
    ).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({ code: 'FORBIDDEN' }) as unknown,
      }),
    );
  });
});

describe('requireUserSession', () => {
  it('returns the user id of a session', () => {
    expect(requireUserSession(principal('session'))).toBe(
      '0193d2a0-0000-7000-8000-0000000000aa',
    );
  });

  it('refuses an API key with 403', () => {
    expect(() => requireUserSession(principal('api_key'))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('answers 404, not 403, to an API key of another workspace', () => {
    const outsider = { ...principal('api_key'), memberships: [] };

    expect(() =>
      requireUserWithWorkspaceRole(outsider, WORKSPACE, 'member'),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('returns the user and role of a signed-in member', () => {
    expect(
      requireUserWithWorkspaceRole(principal('session'), WORKSPACE, 'member'),
    ).toEqual({
      userId: '0193d2a0-0000-7000-8000-0000000000aa',
      role: 'member',
    });
  });
});
