import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { RequestLoggingMiddleware } from './request-logging.middleware.js';

/** Structured request logs that carry the request id (PRD section 13). */
@Module({})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('{*path}');
  }
}
