import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env.schema.js';
import {
  STATEMENT_TIMEOUT_MS,
  buildDataSourceOptions,
} from './data-source-options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions(
          config.get('DATABASE_URL', { infer: true }),
          STATEMENT_TIMEOUT_MS,
        ),
    }),
  ],
})
export class DatabaseModule {}
