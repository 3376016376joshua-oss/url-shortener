import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './api-client.js';
import { ApiError, UnexpectedResponseError } from './api-error.js';
import { fetchSession } from './session.js';
import {
  createFakeFetch,
  errorResponse,
  jsonResponse,
} from './testing/fake-fetch.js';

function clientAnswering(response: () => Response) {
  const fake = createFakeFetch({ 'GET /me': response });
  return createApiClient({ fetch: fake.fetch, onUnauthenticated: vi.fn() });
}

describe('fetchSession', () => {
  it('reads the user and their workspaces, ignoring what the shell does not use', async () => {
    const api = clientAnswering(() =>
      jsonResponse({
        kind: 'session',
        user: { id: 'u1', email: 'ada@example.com', name: 'Ada', extra: 1 },
        workspaces: [{ id: 'w1', name: 'Acme', slug: 'acme', role: 'admin' }],
      }),
    );

    await expect(fetchSession(api)).resolves.toEqual({
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
      workspaces: [{ id: 'w1', name: 'Acme', role: 'admin' }],
    });
  });

  it('treats a 401 as signed out, not as a failure', async () => {
    const api = clientAnswering(() =>
      errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue'),
    );

    await expect(fetchSession(api)).resolves.toBeNull();
  });

  it('fails on an outage, which says nothing about the session', async () => {
    const api = clientAnswering(() =>
      errorResponse(503, 'SERVICE_UNAVAILABLE', 'Down'),
    );

    await expect(fetchSession(api)).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses a role it does not know', async () => {
    const api = clientAnswering(() =>
      jsonResponse({
        user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
        workspaces: [{ id: 'w1', name: 'Acme', role: 'superuser' }],
      }),
    );

    await expect(fetchSession(api)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
