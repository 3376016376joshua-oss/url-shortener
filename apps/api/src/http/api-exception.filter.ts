import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';
import { toErrorResponse } from './error-response.js';
import { getRequestId } from './request-id.middleware.js';

/** Answers every failed request with the API's error body. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const { status, body } = toErrorResponse(exception);

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      // The client gets a generic body, so the cause must be recorded here.
      const requestId = getRequestId(http.getRequest<Request>());
      this.logger.error(
        `${body.code} on request ${requestId ?? 'unknown'}: ${String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }
    httpAdapter.reply(response, body, status);
  }
}
