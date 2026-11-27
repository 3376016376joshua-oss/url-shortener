import { createHash } from 'node:crypto';
import type { Request } from 'express';

const BEARER = /^Bearer\s+(\S+)\s*$/i;
const SESSION_COOKIE = 'session';

function sessionCookie(cookieHeader: string | undefined): string | undefined {
  for (const pair of (cookieHeader ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const value = pair.slice(separator + 1).trim();
    if (pair.slice(0, separator).trim() === SESSION_COOKIE && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * The SHA-256 of the API key or session token a request presents, valid or
 * not, or `null` when it presents none. The limiter runs before
 * authentication, so it reads the credential itself; hashing keeps the secret
 * out of Redis key names.
 */
export function presentedCredentialHash(request: Request): string | null {
  const bearer = BEARER.exec(request.get('authorization') ?? '')?.[1];
  const credential = bearer ?? sessionCookie(request.get('cookie'));
  if (credential === undefined) {
    return null;
  }
  return createHash('sha256').update(credential).digest('hex');
}
