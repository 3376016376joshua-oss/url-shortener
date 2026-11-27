import type { NestApplicationOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.schema.js';
import { requestIdMiddleware } from './http/request-id.middleware.js';

const JSON_BODY_LIMIT = '10kb';

/**
 * Nest's default parsers are turned off so that `configureApp` decides both
 * what is parsed (JSON only) and when (after the request id is assigned).
 */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/**
 * HTTP-level settings shared by the real server and the end-to-end tests, so
 * tests exercise the application exactly as it is deployed. Create the
 * application with `APP_OPTIONS`.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Makes the client IP correct behind a load balancer; rate limits key on it.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.disable('x-powered-by');

  // Order matters: the id must exist before anything can reject the request.
  app.use(requestIdMiddleware);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}
