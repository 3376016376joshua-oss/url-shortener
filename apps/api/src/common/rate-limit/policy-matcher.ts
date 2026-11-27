import { RateLimitPolicy } from './rate-limit-policy.js';

const MANAGEMENT_API_PREFIX = '/api/v1/';

/** Operational endpoints, reachable only on the internal network. */
const EXEMPT_PATH = /^\/(health|metrics|internal)(\/|$)/;

/** A short code is the whole path: one segment, nothing below it. */
const SINGLE_SEGMENT_PATH = /^\/[^/]+$/;

/**
 * The endpoints anyone can call without a credential to create accounts,
 * guess passwords, or trigger mail. All are `POST`.
 */
const AUTH_PATHS: ReadonlySet<string> = new Set([
  '/api/v1/auth/sign-up',
  '/api/v1/auth/sign-in',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/verify-email/resend',
  '/api/v1/auth/password-reset',
  '/api/v1/auth/password-reset/confirm',
  '/api/v1/invitations/accept',
]);

export interface RateLimitedRequest {
  method: string;
  /** The URL path, without the query string. */
  path: string;
  presentsCredential: boolean;
}

/**
 * The router ignores letter case and a trailing slash, so the limiter must
 * too, or `/API/V1/auth/sign-in/` would reach sign-in without its limit.
 */
function normalisePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed.toLowerCase();
}

/**
 * Decides which policies a request must pass, from its method and path
 * alone, so no route has to be marked by the workstream that owns it.
 */
export function matchPolicies(request: RateLimitedRequest): RateLimitPolicy[] {
  const method = request.method.toUpperCase();
  const path = normalisePath(request.path);

  if (EXEMPT_PATH.test(path)) {
    return [];
  }
  if (`${path}/`.startsWith(MANAGEMENT_API_PREFIX)) {
    const policies: RateLimitPolicy[] = [RateLimitPolicy.Api];
    if (request.presentsCredential) {
      policies.push(RateLimitPolicy.Credential);
    }
    if (method === 'POST' && AUTH_PATHS.has(path)) {
      policies.push(RateLimitPolicy.Auth);
    }
    return policies;
  }
  const isRead = method === 'GET' || method === 'HEAD';
  if (isRead && SINGLE_SEGMENT_PATH.test(path)) {
    return [RateLimitPolicy.Redirect];
  }
  return [];
}
