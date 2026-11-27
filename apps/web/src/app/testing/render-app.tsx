import { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, onTestFinished } from 'vitest';
import type { Session } from '../../api/session.js';
import {
  createFakeFetch,
  errorResponse,
  jsonResponse,
  type FakeHandlers,
  type FakeRequest,
} from '../../api/testing/fake-fetch.js';
import { AppProviders, createSessionAwareApiClient } from '../providers.js';
import { collectRegistry } from '../registry/collect.js';
import type { FeatureRoutes } from '../registry/feature-routes.js';
import type { LinkTabsModule } from '../registry/link-tabs.js';
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
  /** The `routes` exports of the features to plug in. */
  features?: FeatureRoutes[];
  /** The exports of the `link-tabs.tsx` modules to plug in. */
  linkTabs?: LinkTabsModule[];
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

/** The modules keyed as discovery would key them, in the order given. */
function asDiscovered(modules: ReadonlyArray<unknown>, file: string) {
  return Object.fromEntries(
    modules.map((module, index) => [
      `feature-${String(index)}/${file}`,
      module,
    ]),
  );
}

/**
 * Renders the whole dashboard in memory, at an address, against a fake API:
 * the way to test a page inside the real layouts, session, and routing.
 *
 * Call it inside a test. A request to an endpoint without a handler fails
 * that test when it ends, whatever else the test asserted.
 */
export function renderApp(options: RenderAppOptions = {}): RenderedApp {
  const session =
    options.session === undefined ? TEST_SESSION : options.session;
  const fake = createFakeFetch({
    'GET /me': sessionHandler(session),
    ...options.handlers,
  });
  onTestFinished(() => {
    expect(fake.unhandled, 'requests without a handler').toEqual([]);
  });
  // No retries: a test that expects a failure should see it at once.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const registry = collectRegistry(
    asDiscovered(
      (options.features ?? []).map((routes) => ({ routes })),
      'routes.tsx',
    ),
    asDiscovered(options.linkTabs ?? [], 'link-tabs.tsx'),
  );
  const router = createMemoryRouter(buildRoutes(registry), {
    initialEntries: [options.path ?? '/'],
  });
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
