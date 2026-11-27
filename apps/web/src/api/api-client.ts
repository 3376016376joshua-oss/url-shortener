import { apiErrorBodySchema } from '@url-shortener/contracts';
import type { ZodType } from 'zod';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
  fallbackErrorCode,
} from './api-error.js';

/** Every management endpoint lives under this path, on the dashboard's origin. */
export const API_BASE_PATH = '/api/v1';

const REQUEST_ID_HEADER = 'X-Request-Id';
const RETRY_AFTER_HEADER = 'Retry-After';
const HTTP_SERVER_ERROR_FLOOR = 500;
const UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable';
const REJECTED_MESSAGE = 'The request could not be completed';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryParams = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export interface RequestOptions {
  /** Appended to the path; `null` and `undefined` values are left out. */
  query?: QueryParams;
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
}

export interface ParsedRequestOptions<T> extends RequestOptions {
  /** The response body must match this schema, which also gives it its type. */
  schema: ZodType<T>;
}

export interface ApiClient {
  /** For an endpoint whose response body is ignored, such as a `204`. */
  request(
    method: HttpMethod,
    path: string,
    options?: RequestOptions,
  ): Promise<void>;
  /** For an endpoint that answers with a body. */
  request<T>(
    method: HttpMethod,
    path: string,
    options: ParsedRequestOptions<T>,
  ): Promise<T>;
}

export interface ApiClientDependencies {
  fetch: typeof fetch;
  /** Called on every `401`: the session is gone, whatever the request was. */
  onUnauthenticated: () => void;
}

function buildUrl(path: string, query: QueryParams | undefined): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      search.set(name, String(value));
    }
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return `${API_BASE_PATH}${path}${suffix}`;
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

async function send(
  fetchFn: typeof fetch,
  method: HttpMethod,
  path: string,
  options: RequestOptions,
): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }
  if (options.signal !== undefined) {
    init.signal = options.signal;
  }
  try {
    return await fetchFn(buildUrl(path, options.query), init);
  } catch (cause) {
    // A cancelled request is not a failure; the caller asked for it.
    if (isAbort(cause)) {
      throw cause;
    }
    throw new NetworkError({ cause });
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    // Not JSON at all, for example an HTML error page from a proxy.
    return undefined;
  }
}

function parseRetryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get(RETRY_AFTER_HEADER) ?? '');
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = apiErrorBodySchema.safeParse(await readJson(response));
  const fallbackMessage =
    response.status >= HTTP_SERVER_ERROR_FLOOR
      ? UNAVAILABLE_MESSAGE
      : REJECTED_MESSAGE;
  return new ApiError({
    status: response.status,
    code: body.success ? body.data.code : fallbackErrorCode(response.status),
    message: body.success ? body.data.message : fallbackMessage,
    requestId: response.headers.get(REQUEST_ID_HEADER),
    retryAfterSeconds: parseRetryAfter(response),
  });
}

async function parseBody<T>(
  response: Response,
  schema: ZodType<T>,
  endpoint: string,
): Promise<T> {
  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new UnexpectedResponseError(endpoint, { cause: parsed.error });
  }
  return parsed.data;
}

/**
 * The one way the dashboard talks to the API: same-origin JSON, the session
 * cookie attached by the browser, failures raised as typed errors.
 */
export function createApiClient(deps: ApiClientDependencies): ApiClient {
  async function request<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions & { schema?: ZodType<T> } = {},
  ): Promise<T | undefined> {
    const response = await send(deps.fetch, method, path, options);
    if (!response.ok) {
      const error = await toApiError(response);
      if (error.isUnauthenticated) {
        deps.onUnauthenticated();
      }
      throw error;
    }
    if (options.schema === undefined) {
      return undefined;
    }
    return parseBody(response, options.schema, `${method} ${path}`);
  }
  return { request };
}
