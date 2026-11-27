import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

/** The rate limit policies of PRD section 13. */
export const RateLimitPolicy = {
  /** `GET /{code}`, per client address. */
  Redirect: 'redirect',
  /** Every management API request, per client address. */
  Api: 'api',
  /** Every management API request that presents a credential, per credential. */
  Credential: 'credential',
  /** The unauthenticated account endpoints, per client address. */
  Auth: 'auth',
} as const;
export type RateLimitPolicy =
  (typeof RateLimitPolicy)[keyof typeof RateLimitPolicy];

export interface RateLimitSettings {
  /** Length of the fixed window every policy counts in. */
  windowSeconds: number;
  /** Requests allowed per window, for each policy. */
  limits: Readonly<Record<RateLimitPolicy, number>>;
}

/** Injection token for the `RateLimitSettings` in force. */
export const RATE_LIMIT_SETTINGS = Symbol('RATE_LIMIT_SETTINGS');

const WINDOW_SECONDS = 60;

export function buildRateLimitSettings(
  config: ConfigService<Env, true>,
): RateLimitSettings {
  return {
    windowSeconds: WINDOW_SECONDS,
    limits: {
      [RateLimitPolicy.Redirect]: config.get('RATE_LIMIT_REDIRECT_PER_MINUTE', {
        infer: true,
      }),
      [RateLimitPolicy.Api]: config.get('RATE_LIMIT_API_PER_MINUTE', {
        infer: true,
      }),
      [RateLimitPolicy.Credential]: config.get(
        'RATE_LIMIT_CREDENTIAL_PER_MINUTE',
        { infer: true },
      ),
      [RateLimitPolicy.Auth]: config.get('RATE_LIMIT_AUTH_PER_MINUTE', {
        infer: true,
      }),
    },
  };
}
