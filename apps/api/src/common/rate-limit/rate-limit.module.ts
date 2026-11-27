import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitCounter } from './rate-limit-counter.js';
import {
  RATE_LIMIT_SETTINGS,
  buildRateLimitSettings,
} from './rate-limit-policy.js';
import { RateLimitGuard } from './rate-limit.guard.js';

/** Rate limiting (PRD section 13). */
@Module({
  providers: [
    {
      provide: RATE_LIMIT_SETTINGS,
      inject: [ConfigService],
      useFactory: buildRateLimitSettings,
    },
    RateLimitCounter,
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class RateLimitModule {}
