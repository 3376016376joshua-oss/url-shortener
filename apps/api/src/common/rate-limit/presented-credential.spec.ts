import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { presentedCredentialHash } from './presented-credential.js';

function requestWith(headers: Record<string, string>): Request {
  return {
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

describe('presentedCredentialHash', () => {
  it('is null when the request presents nothing', () => {
    expect(presentedCredentialHash(requestWith({}))).toBeNull();
  });

  it('hashes an API key sent as a bearer token', () => {
    const request = requestWith({ authorization: 'Bearer usk_abc123' });

    expect(presentedCredentialHash(request)).toBe(sha256('usk_abc123'));
  });

  it('hashes the session cookie, wherever it is among the cookies', () => {
    const request = requestWith({
      cookie: 'theme=dark; session=token-value; other=1',
    });

    expect(presentedCredentialHash(request)).toBe(sha256('token-value'));
  });

  it('prefers the API key when both are presented', () => {
    const request = requestWith({
      authorization: 'bearer usk_abc123',
      cookie: 'session=token-value',
    });

    expect(presentedCredentialHash(request)).toBe(sha256('usk_abc123'));
  });

  it.each([
    ['another authorisation scheme', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['an empty session cookie', { cookie: 'session=' }],
    ['a cookie whose name only ends in "session"', { cookie: 'xsession=1' }],
  ])('ignores %s', (_what, headers) => {
    expect(presentedCredentialHash(requestWith(headers))).toBeNull();
  });

  it('never returns the credential itself', () => {
    const request = requestWith({ authorization: 'Bearer usk_abc123' });

    expect(presentedCredentialHash(request)).not.toContain('usk_abc123');
  });
});
