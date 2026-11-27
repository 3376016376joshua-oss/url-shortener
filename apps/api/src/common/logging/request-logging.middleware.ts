import { randomUUID } from 'node:crypto';
import {
  HttpStatus,
  Injectable,
  Logger,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../../http/request-id.middleware.js';
import { routePattern } from '../metrics/route-pattern.js';
import { runInRequestContext } from './request-context.js';

const NANOSECONDS_PER_MILLISECOND = 1e6;

/** Polled every few seconds by the orchestrator and Prometheus: pure noise. */
const UNLOGGED_PATH = /^\/(health|metrics)(\/|$)/i;

/**
 * Logs one record per request, and makes the request id available to every
 * log line written while the request is handled.
 *
 * The record deliberately has no client address, query string, header, or
 * body: short-link visitors are never identified, and a query string or a
 * destination URL can carry a token.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Http');

  use(request: Request, response: Response, next: NextFunction): void {
    const context = { requestId: getRequestId(request) ?? randomUUID() };
    const startedAt = process.hrtime.bigint();
    // Read from the original URL: inside middleware, `request.path` is
    // relative to where the middleware is mounted.
    const [path = '/'] = request.originalUrl.split('?');

    if (!UNLOGGED_PATH.test(path)) {
      response.once('finish', () => {
        // An emitter does not keep the context its listener was added in.
        runInRequestContext(context, () => {
          this.logCompleted({ request, response, path, startedAt });
        });
      });
    }
    runInRequestContext(context, next);
  }

  private logCompleted(completed: {
    request: Request;
    response: Response;
    path: string;
    startedAt: bigint;
  }): void {
    const { request, response, path, startedAt } = completed;
    const elapsed = process.hrtime.bigint() - startedAt;
    const fields = {
      method: request.method,
      route: routePattern(request),
      path,
      status: response.statusCode,
      durationMs: Math.round(Number(elapsed) / NANOSECONDS_PER_MILLISECOND),
    };
    const isServerFault =
      response.statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR);
    if (isServerFault) {
      this.logger.warn('request completed', fields);
    } else {
      this.logger.log('request completed', fields);
    }
  }
}
