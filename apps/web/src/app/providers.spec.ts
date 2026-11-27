import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { sessionQueryKey, type Session } from '../api/session.js';
import { createFakeFetch, errorResponse } from '../api/testing/fake-fetch.js';
import { createSessionAwareApiClient } from './providers.js';

const SESSION: Session = {
  user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' },
  workspaces: [],
};
const LINKS_KEY = ['workspaces', 'ws-1', 'links'];

function setup(session: Session | null) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(sessionQueryKey, session);
  queryClient.setQueryData(LINKS_KEY, { items: ['launch'] });
  const fake = createFakeFetch({
    'GET /expired': () => errorResponse(401, 'UNAUTHENTICATED', 'Sign in'),
    'GET /forbidden': () => errorResponse(403, 'FORBIDDEN', 'Not allowed'),
  });
  const api = createSessionAwareApiClient(queryClient, fake.fetch);
  return { queryClient, api };
}

describe('createSessionAwareApiClient', () => {
  it('ends the session on a 401 and forgets what that user had loaded', async () => {
    const { queryClient, api } = setup(SESSION);

    await expect(api.request('GET', '/expired')).rejects.toThrow('Sign in');

    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull();
    expect(queryClient.getQueryData(LINKS_KEY)).toBeUndefined();
  });

  it('leaves the session alone on any other failure', async () => {
    const { queryClient, api } = setup(SESSION);

    await expect(api.request('GET', '/forbidden')).rejects.toThrow();

    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(SESSION);
    expect(queryClient.getQueryData(LINKS_KEY)).toEqual({ items: ['launch'] });
  });

  it('keeps what a signed-out visitor loaded when a request answers 401', async () => {
    const { queryClient, api } = setup(null);

    await expect(api.request('GET', '/expired')).rejects.toThrow();

    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull();
    expect(queryClient.getQueryData(LINKS_KEY)).toEqual({ items: ['launch'] });
  });
});
