import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * A caller's id is kept only if it is short and plain, so it can be written
 * to logs and echoed in a header without any escaping.
 */
const ACCEPTABLE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Gives every request an id: the caller's `X-Request-Id` when acceptable,
 * otherwise a new one. It is echoed on the response and left on the request
 * for `getRequestId`. Installed first, so even a request that is rejected
 * before it reaches a route can be traced.
 */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const presented = request.get(REQUEST_ID_HEADER);
  const requestId =
    presented !== undefined && ACCEPTABLE_REQUEST_ID.test(presented)
      ? presented
      : randomUUID();

  request.headers[REQUEST_ID_HEADER] = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(request: Request): string | undefined {
  return request.get(REQUEST_ID_HEADER);
}
