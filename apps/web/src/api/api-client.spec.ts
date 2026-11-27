import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApiClient } from './api-client.js';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from './api-error.js';
import {
  createFakeFetch,
  emptyResponse,
  errorResponse,
  jsonResponse,
  type FakeHandlers,
} from './testing/fake-fetch.js';

const linkSchema = z.object({ id: z.string() });

function setup(handlers: FakeHandlers) {
  const fake = createFakeFetch(handlers);
  const onUnauthenticated = vi.fn();
  const api = createApiClient({ fetch: fake.fetch, onUnauthenticated });
  return { api, onUnauthenticated, requests: fake.requests };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('Expected the request to fail');
    },
    (error: unknown) => error,
  );
}

describe('createApiClient', () => {
  it('reads a response through its schema', async () => {
    const { api, requests } = setup({
      'GET /links/1': () => jsonResponse({ id: '1', extra: true }),
    });

    const link = await api.request('GET', '/links/1', { schema: linkSchema });

    expect(link).toEqual({ id: '1' });
    expect(requests[0]?.headers.get('Accept')).toBe('application/json');
    expect(requests[0]?.headers.has('Content-Type')).toBe(false);
  });

  it('sends the body as JSON', async () => {
    const { api, requests } = setup({
      'POST /links': () => jsonResponse({ id: '2' }, 201),
    });

    await api.request('POST', '/links', {
      body: { destinationUrl: 'https://example.com' },
      schema: linkSchema,
    });

    expect(requests[0]?.body).toEqual({
      destinationUrl: 'https://example.com',
    });
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json');
  });

  it('calls the API on the same origin, with the session cookie', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(emptyResponse()));
    const api = createApiClient({ fetch: fetchFn, onUnauthenticated: vi.fn() });

    await api.request('DELETE', '/links/1');

    expect(fetchFn).toHaveBeenCalledWith(
      '/api/v1/links/1',
      expect.objectContaining({ method: 'DELETE', credentials: 'same-origin' }),
    );
  });

  it('adds query parameters, leaving out the ones without a value', async () => {
    const { api, requests } = setup({
      'GET /links': () => jsonResponse({ id: '1' }),
    });

    await api.request('GET', '/links', {
      query: { search: 'a b', limit: 25, cursor: null, status: undefined },
      schema: linkSchema,
    });

    expect(requests[0]?.query.toString()).toBe('search=a+b&limit=25');
  });

  it('resolves with nothing when no schema is given', async () => {
    const { api } = setup({ 'DELETE /links/1': () => emptyResponse() });

    await expect(api.request('DELETE', '/links/1')).resolves.toBeUndefined();
  });

  it('raises the documented error body as an ApiError', async () => {
    const { api } = setup({
      'POST /links': () =>
        errorResponse(429, 'RATE_LIMITED', 'Slow down', {
          'X-Request-Id': 'req-1',
          'Retry-After': '30',
        }),
    });

    const error = await failure(api.request('POST', '/links', { body: {} }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Slow down',
      requestId: 'req-1',
      retryAfterSeconds: 30,
      isRateLimited: true,
    });
  });

  it.each([
    { status: 502, code: 'SERVICE_UNAVAILABLE' },
    { status: 418, code: 'REQUEST_REJECTED' },
  ])(
    'gives a $status that is not in the error body the code $code',
    async ({ status, code }) => {
      const { api } = setup({
        'GET /links': () =>
          new Response('<html>Bad gateway</html>', { status }),
      });

      const error = await failure(
        api.request('GET', '/links', { schema: linkSchema }),
      );

      expect(error).toMatchObject({ status, code, requestId: null });
    },
  );

  it('reports every 401, so the shell can end the session', async () => {
    const { api, onUnauthenticated } = setup({
      'GET /links': () => errorResponse(401, 'UNAUTHENTICATED', 'Sign in'),
      'GET /domains': () => errorResponse(403, 'FORBIDDEN', 'Not allowed'),
    });

    await failure(api.request('GET', '/domains', { schema: linkSchema }));
    expect(onUnauthenticated).not.toHaveBeenCalled();

    const error = await failure(
      api.request('GET', '/links', { schema: linkSchema }),
    );
    expect(onUnauthenticated).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ isUnauthenticated: true });
  });

  it('raises a NetworkError when no response arrives', async () => {
    const api = createApiClient({
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      onUnauthenticated: vi.fn(),
    });

    const error = await failure(api.request('GET', '/links'));

    expect(error).toBeInstanceOf(NetworkError);
  });

  it('lets a cancelled request through as a cancellation, not a failure', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    const api = createApiClient({
      fetch: () => Promise.reject(abort),
      onUnauthenticated: vi.fn(),
    });

    await expect(api.request('GET', '/links')).rejects.toBe(abort);
  });

  it('refuses a successful response in the wrong shape', async () => {
    const { api } = setup({ 'GET /links/1': () => jsonResponse({ id: 1 }) });

    const error = await failure(
      api.request('GET', '/links/1', { schema: linkSchema }),
    );

    expect(error).toBeInstanceOf(UnexpectedResponseError);
    expect(error).toMatchObject({
      message: 'Unexpected response from GET /links/1',
    });
  });
});
