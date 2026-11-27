import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_OPTIONS, configureApp } from './app.setup.js';
import { createAppLogger } from './common/logging/app-logger.js';
import type { Env } from './config/env.schema.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  ...APP_OPTIONS,
  bufferLogs: true,
});
const config = app.get<ConfigService<Env, true>>(ConfigService);

const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
app.useLogger(createAppLogger({ json: isProduction }));

configureApp(app);
app.enableShutdownHooks();

await app.listen(config.get('PORT', { infer: true }));
