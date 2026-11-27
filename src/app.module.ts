import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { createValidationException } from './common/errors/validation-exception.factory.js';
import { MetricsModule } from './common/metrics/metrics.module.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { LinksModule } from './links/links.module.js';
import { RedirectModule } from './redirect/redirect.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    MetricsModule,
    RateLimitModule,
    HealthModule,
    AnalyticsModule,
    LinksModule,
    // Keep last: GET /:code matches any single-segment path, so every other
    // route has to be registered before it.
    RedirectModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: createValidationException,
      }),
    },
  ],
})
export class AppModule {}
