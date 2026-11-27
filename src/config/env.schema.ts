import { z } from 'zod';

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

/**
 * Deployment-specific configuration. Policy numbers (TTLs, limits, lengths)
 * are named constants in the module that owns them, not environment variables.
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
  API_KEYS: z.string().default(''),
  BLOCKED_HOSTS: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;
