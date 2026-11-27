import { describe, expect, it } from 'vitest';
import { matchPolicies } from './policy-matcher.js';

const anonymous = { presentsCredential: false };

describe('matchPolicies', () => {
  it('limits a short code by the redirect policy only', () => {
    expect(
      matchPolicies({ method: 'GET', path: '/abc1234', ...anonymous }),
    ).toEqual(['redirect']);
    expect(
      matchPolicies({ method: 'HEAD', path: '/abc1234', ...anonymous }),
    ).toEqual(['redirect']);
  });

  it('limits a management request by client address', () => {
    expect(
      matchPolicies({
        method: 'GET',
        path: '/api/v1/workspaces/1/links',
        ...anonymous,
      }),
    ).toEqual(['api']);
  });

  it('adds the credential policy when a credential is presented', () => {
    expect(
      matchPolicies({
        method: 'GET',
        path: '/api/v1/me',
        presentsCredential: true,
      }),
    ).toEqual(['api', 'credential']);
  });

  it.each([
    '/api/v1/auth/sign-up',
    '/api/v1/auth/sign-in',
    '/api/v1/auth/verify-email',
    '/api/v1/auth/verify-email/resend',
    '/api/v1/auth/password-reset',
    '/api/v1/auth/password-reset/confirm',
    '/api/v1/invitations/accept',
  ])('adds the auth policy to POST %s', (path) => {
    expect(matchPolicies({ method: 'POST', path, ...anonymous })).toEqual([
      'api',
      'auth',
    ]);
  });

  it('applies all three management policies to a signed-in invitation acceptance', () => {
    expect(
      matchPolicies({
        method: 'POST',
        path: '/api/v1/invitations/accept',
        presentsCredential: true,
      }),
    ).toEqual(['api', 'credential', 'auth']);
  });

  it('does not treat signing out as an auth endpoint', () => {
    expect(
      matchPolicies({
        method: 'POST',
        path: '/api/v1/auth/sign-out',
        ...anonymous,
      }),
    ).toEqual(['api']);
  });

  it.each([
    ['in another letter case', '/API/V1/Auth/Sign-In'],
    ['with a trailing slash', '/api/v1/auth/sign-in/'],
  ])('matches a path written %s, as the router does', (_how, path) => {
    expect(matchPolicies({ method: 'POST', path, ...anonymous })).toEqual([
      'api',
      'auth',
    ]);
  });

  it.each([
    '/health',
    '/health/ready',
    '/metrics',
    '/Metrics/',
    '/internal/tls/authorize',
  ])('exempts the operational endpoint %s', (path) => {
    expect(matchPolicies({ method: 'GET', path, ...anonymous })).toEqual([]);
  });

  it.each([
    ['the root', 'GET', '/'],
    ['a nested path outside the API', 'GET', '/a/b'],
    ['a write to a single segment', 'POST', '/abc1234'],
  ])('applies no policy to %s', (_what, method, path) => {
    expect(matchPolicies({ method, path, ...anonymous })).toEqual([]);
  });
});
