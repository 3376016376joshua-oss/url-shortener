import { z } from 'zod';

export interface ApiKey {
  ownerId: string;
  key: string;
}

/** `ownerId:key`. The owner id must fit `url_mappings.owner_id`. */
const API_KEY_ENTRY = /^([A-Za-z0-9_-]{1,64}):([A-Za-z0-9._~+/=-]{16,128})$/;
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

/** Messages never repeat the entry: it holds a secret. */
function parseApiKeys(value: string, context: z.RefinementCtx): ApiKey[] {
  const apiKeys: ApiKey[] = [];
  for (const entry of splitList(value)) {
    const [, ownerId, key] = API_KEY_ENTRY.exec(entry) ?? [];
    if (ownerId === undefined || key === undefined) {
      context.addIssue({
        code: 'custom',
        message:
          'must be comma-separated ownerId:key pairs, with keys of 16 to 128 URL-safe characters',
      });
      return z.NEVER;
    }
    apiKeys.push({ ownerId, key });
  }
  if (new Set(apiKeys.map(({ key }) => key)).size !== apiKeys.length) {
    context.addIssue({ code: 'custom', message: 'must not repeat a key' });
    return z.NEVER;
  }
  return apiKeys;
}

function parseHosts(value: string, context: z.RefinementCtx): string[] {
  const hosts = splitList(value.toLowerCase());
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
 * Deployment-specific configuration, validated at start-up. Other policy
 * numbers (TTLs, lengths, retry counts) are named constants in the module that
 * owns them, not environment variables.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BASE_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3000')
    .transform(trimTrailingSlashes),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  API_KEYS: z.string().default('').transform(parseApiKeys),
  BLOCKED_HOSTS: z.string().default('').transform(parseHosts),
  RATE_LIMIT_REDIRECT_PER_MINUTE: requestsPerMinute(300),
  RATE_LIMIT_API_PER_MINUTE: requestsPerMinute(120),
  RATE_LIMIT_CREATE_ANON_PER_MINUTE: requestsPerMinute(10),
  RATE_LIMIT_API_KEY_PER_MINUTE: requestsPerMinute(300),
});

export type Env = z.infer<typeof envSchema>;
