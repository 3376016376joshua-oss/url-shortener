import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../config/env.schema.js';

export const SESSION_COOKIE_NAME = 'session';

/** The session token a request presents, or `null` when it has no cookie. */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.cookie;
  if (header === undefined) {
    return null;
  }
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (pair.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      const value = pair.slice(separator + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}

/** Sets and clears the session cookie (PRD section 6). */
@Injectable()
export class SessionCookie {
  /**
   * No `Domain` attribute: the cookie is host-only, so it is never sent to
   * a short domain. `Secure` follows the app's own scheme, which is HTTPS
   * everywhere but a developer's machine.
   */
  private readonly attributes: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    this.attributes = {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.get('APP_URL', { infer: true }).startsWith('https://'),
      path: '/',
    };
  }

  set(response: Response, token: string, expiresAt: Date): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      ...this.attributes,
      expires: expiresAt,
    });
  }

  clear(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, this.attributes);
  }
}
