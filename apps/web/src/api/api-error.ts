import { ErrorCode } from '@url-shortener/contracts';

const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;

export interface ApiErrorDetails {
  status: number;
  code: ErrorCode;
  message: string;
  /** The `X-Request-Id` of the failed response: what support asks for. */
  requestId: string | null;
  /** From `Retry-After`, on a rate-limited response. */
  retryAfterSeconds: number | null;
}

/** The API answered with a failure, in the documented error body or not. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = 'ApiError';
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }

  get isUnauthenticated(): boolean {
    return this.status === HTTP_UNAUTHORIZED;
  }

  get isRateLimited(): boolean {
    return this.status === HTTP_TOO_MANY_REQUESTS;
  }

  /** The request was fine; the platform could not serve it right now. */
  get isServerFault(): boolean {
    return this.status >= HTTP_SERVER_ERROR_FLOOR;
  }
}

/** No response arrived at all: offline, DNS failure, or a dropped connection. */
export class NetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super('The network request failed', options);
    this.name = 'NetworkError';
  }
}

/** A successful response whose body does not match the schema it promised. */
export class UnexpectedResponseError extends Error {
  constructor(endpoint: string, options?: ErrorOptions) {
    super(`Unexpected response from ${endpoint}`, options);
    this.name = 'UnexpectedResponseError';
  }
}

/**
 * The code and message for a failure that did not arrive in the documented
 * error body, for example a gateway error page from the edge.
 */
export function undocumentedFailure(
  status: number,
): Pick<ApiErrorDetails, 'code' | 'message'> {
  return status >= HTTP_SERVER_ERROR_FLOOR
    ? {
        code: ErrorCode.ServiceUnavailable,
        message: 'The service is temporarily unavailable',
      }
    : {
        code: ErrorCode.RequestRejected,
        message: 'The request could not be completed',
      };
}
