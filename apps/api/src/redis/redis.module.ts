import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { RedisLifecycleService } from './redis-lifecycle.service.js';
import { REDIS_CLIENT, createRedisClient } from './redis-client.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createRedisClient(config.get('REDIS_URL', { infer: true })),
    },
    RedisLifecycleService,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
