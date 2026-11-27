import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.schema.js';

const JSON_BODY_LIMIT = '10kb';

/**
 * HTTP-level settings shared by the real server and the end-to-end tests, so
 * tests exercise the application exactly as it is deployed.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Makes the client IP correct behind a load balancer; rate limits key on it.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}
