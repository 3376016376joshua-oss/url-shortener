import { z } from 'zod';

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const MIN_SECRET_LENGTH = 32;

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

const hostname = z
  .string()
  .transform((value) => value.toLowerCase())
  .refine((value) => HOSTNAME.test(value), 'must be a host name');

function parseHosts(value: string, context: z.RefinementCtx): string[] {
  const hosts = value
    .toLowerCase()
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const invalid = hosts.filter((host) => !HOSTNAME.test(host));
  if (invalid.length > 0) {
    context.addIssue({
      code: 'custom',
      message: `must be comma-separated host names, got: ${invalid.join(', ')}`,
    });
    return z.NEVER;
  }
  return hosts;
}

const requestsPerMinute = (defaultLimit: number) =>
  z.coerce.number().int().min(1).default(defaultLimit);

/**
 * Deployment-specific configuration, validated at start-up (PRD section 16).
 * Other policy numbers (TTLs, lengths, retry counts) are named constants in
 * the module that owns them, not environment variables.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Which duties this process performs; lets workers scale apart from HTTP. */
  PROCESS_ROLE: z.enum(['all', 'web', 'worker']).default('all'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  /** Origin of the dashboard and the management API. */
  APP_URL: z.url({ protocol: /^https?$/ }).transform(trimTrailingSlashes),
  /** The platform's own short domain, usable by every workspace. */
  DEFAULT_SHORT_DOMAIN: hostname,
  /** The host custom domains must point their CNAME at. */
  CNAME_TARGET: hostname,
  /** Keys the stable hashes that must survive restarts, such as A/B assignment. */
  APP_SECRET: z.string().min(MIN_SECRET_LENGTH),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  MAIL_FROM: z.email(),

  /** Path to a MaxMind-format country database; without it, countries are unknown. */
  GEOIP_DB_PATH: z.string().min(1).optional(),
  BLOCKED_HOSTS: z.string().default('').transform(parseHosts),

  RATE_LIMIT_REDIRECT_PER_MINUTE: requestsPerMinute(600),
  RATE_LIMIT_API_PER_MINUTE: requestsPerMinute(300),
  RATE_LIMIT_CREDENTIAL_PER_MINUTE: requestsPerMinute(600),
  RATE_LIMIT_AUTH_PER_MINUTE: requestsPerMinute(10),
});

export type Env = z.infer<typeof envSchema>;
