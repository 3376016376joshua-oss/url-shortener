import { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Session } from '../../api/session.js';
import {
  createFakeFetch,
  errorResponse,
  jsonResponse,
  type FakeHandlers,
  type FakeRequest,
} from '../../api/testing/fake-fetch.js';
import { AppProviders, createSessionAwareApiClient } from '../providers.js';
import { EMPTY_REGISTRY, type Registry } from '../registry/collect.js';
import { buildRoutes } from '../router.js';

/** A signed-in owner of one workspace and a member of another. */
export const TEST_SESSION: Session = {
  user: { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  workspaces: [
    { id: 'ws-1', name: 'Acme', role: 'owner' },
    { id: 'ws-2', name: 'Globex', role: 'member' },
  ],
};

export interface RenderAppOptions {
  /** The address the dashboard opens at. Defaults to `/`. */
  path?: string;
  /** What the features contribute; anything left out is empty. */
  registry?: Partial<Registry>;
  /** The session `GET /me` answers with; `null` is signed out. */
  session?: Session | null;
  /** Further API endpoints, by method and path: `'GET /workspaces/ws-1/links'`. */
  handlers?: FakeHandlers;
}

export interface RenderedApp extends RenderResult {
  router: ReturnType<typeof createMemoryRouter>;
  /** Every API request made so far. */
  requests: FakeRequest[];
}

function sessionHandler(session: Session | null) {
  return () =>
    session === null
      ? errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue')
      : jsonResponse(session);
}

/**
 * Renders the whole dashboard in memory, at an address, against a fake API:
 * the way to test a page inside the real layouts, session, and routing.
 */
export function renderApp(options: RenderAppOptions = {}): RenderedApp {
  const session =
    options.session === undefined ? TEST_SESSION : options.session;
  const fake = createFakeFetch({
    'GET /me': sessionHandler(session),
    ...options.handlers,
  });
  // No retries: a test that expects a failure should see it at once.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    buildRoutes({ ...EMPTY_REGISTRY, ...options.registry }),
    { initialEntries: [options.path ?? '/'] },
  );
  const rendered = render(
    <AppProviders
      queryClient={queryClient}
      apiClient={createSessionAwareApiClient(queryClient, fake.fetch)}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...rendered, router, requests: fake.requests };
}
