import type { ApiErrorBody, ErrorCode } from '@url-shortener/contracts';
import { API_BASE_PATH } from '../api-client.js';

export interface FakeRequest {
  method: string;
  /** The path under the API base, without the query string: `/me`. */
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
}

export type FakeHandler = (request: FakeRequest) => Response;

/** Handlers by method and path under the API base, for example `GET /me`. */
export type FakeHandlers = Record<string, FakeHandler>;

export interface FakeFetch {
  fetch: typeof fetch;
  /** Every request made so far, in order. */
  requests: FakeRequest[];
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  const body: ApiErrorBody = {
    statusCode: status,
    error: 'Error',
    code,
    message,
  };
  return jsonResponse(body, status, headers);
}

export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function toFakeRequest(input: string, init: RequestInit): FakeRequest {
  const url = new URL(input, 'http://dashboard.test');
  const body: unknown =
    typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  return {
    method: init.method ?? 'GET',
    path: url.pathname.slice(API_BASE_PATH.length),
    query: url.searchParams,
    body,
    headers: new Headers(init.headers),
  };
}

/**
 * A `fetch` for tests that answers from a table of handlers. A request with
 * no handler rejects, so a test never passes against an endpoint it forgot.
 */
export function createFakeFetch(handlers: FakeHandlers): FakeFetch {
  const requests: FakeRequest[] = [];
  const fakeFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (typeof input !== 'string') {
      return Promise.reject(new Error('The fake fetch takes a string URL'));
    }
    const request = toFakeRequest(input, init);
    requests.push(request);
    const key = `${request.method} ${request.path}`;
    const handler = handlers[key];
    if (handler === undefined) {
      return Promise.reject(new Error(`No fake handler for ${key}`));
    }
    return Promise.resolve(handler(request));
  };
  return { fetch: fakeFetch, requests };
}
