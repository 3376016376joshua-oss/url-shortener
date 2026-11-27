import { useQuery } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useApiClient } from '../api/api-context.js';
import { emptyResponse, errorResponse } from '../api/testing/fake-fetch.js';
import { PageHeader, QueryView } from '../ui/index.js';
import type { Registry } from './registry/collect.js';
import { leaveTo } from './session/leave-to.js';
import { useLinkParams, useSession, useWorkspace } from './shell.js';
import { renderApp, TEST_SESSION } from './testing/render-app.js';

vi.mock('./session/leave-to.js', () => ({ leaveTo: vi.fn() }));

function SignInPage() {
  return <PageHeader title="Sign in" />;
}

function LinksPage() {
  const workspace = useWorkspace();
  return <PageHeader title={`Links of ${workspace.name}`} />;
}

function ProfilePage() {
  return <PageHeader title={`Profile of ${useSession().user.name}`} />;
}

function BrokenPage(): never {
  throw new Error('This page always fails to render');
}

function ProtectedPage() {
  const api = useApiClient();
  const query = useQuery({
    queryKey: ['protected'],
    queryFn: () =>
      api.request('GET', '/protected', {
        schema: z.object({ ok: z.boolean() }),
      }),
  });
  return <QueryView query={query}>{() => <p>Loaded</p>}</QueryView>;
}

function AnalyticsTab() {
  const { workspaceId, linkId } = useLinkParams();
  return <p>{`Analytics of ${linkId} in ${workspaceId}`}</p>;
}

function LinkHeader() {
  return <PageHeader title={`Link ${useLinkParams().linkId}`} />;
}

const REGISTRY: Partial<Registry> = {
  publicRoutes: [{ path: 'sign-in', Component: SignInPage }],
  accountRoutes: [{ path: 'account/profile', Component: ProfilePage }],
  workspaceRoutes: [
    { path: 'links', Component: LinksPage },
    { path: 'protected', Component: ProtectedPage },
    { path: 'broken', Component: BrokenPage },
  ],
  accountNav: [{ label: 'Profile', to: '/account/profile', order: 10 }],
  workspaceNav: [
    { label: 'Links', to: 'links', order: 10 },
    { label: 'Members', to: 'members', order: 20, minRole: 'admin' },
  ],
  linkTabs: [
    { id: 'analytics', label: 'Analytics', order: 10, Component: AnalyticsTab },
    { id: 'qr-code', label: 'QR code', order: 20, Component: () => <p>QR</p> },
  ],
  LinkHeader,
};

function heading(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

describe('the dashboard routes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(leaveTo).mockClear();
  });
  afterEach(cleanup);

  it('sends a signed-out visitor to sign in, remembering the address', async () => {
    const { router } = renderApp({
      path: '/w/ws-1/links?status=ACTIVE',
      registry: REGISTRY,
      session: null,
    });

    await heading('Sign in');
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toBe(
      '?next=%2Fw%2Fws-1%2Flinks%3Fstatus%3DACTIVE',
    );
  });

  it('opens the first section of the first workspace', async () => {
    const { router } = renderApp({ path: '/', registry: REGISTRY });

    await heading('Links of Acme');
    expect(router.state.location.pathname).toBe('/w/ws-1/links');
  });

  it('reopens the workspace that was open last', async () => {
    const first = renderApp({ path: '/w/ws-2/links', registry: REGISTRY });
    await heading('Links of Globex');
    first.unmount();

    const { router } = renderApp({ path: '/', registry: REGISTRY });

    await heading('Links of Globex');
    expect(router.state.location.pathname).toBe('/w/ws-2/links');
  });

  it('sends a user with no workspace to create one', async () => {
    const { router } = renderApp({
      path: '/',
      registry: REGISTRY,
      session: { ...TEST_SESSION, workspaces: [] },
    });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workspaces/new'),
    );
  });

  it('hides a workspace the user is not in behind "not found"', async () => {
    renderApp({ path: '/w/ws-other/links', registry: REGISTRY });

    await heading('Workspace not found');
  });

  it('shows a section only to the roles allowed to use it', async () => {
    const owner = renderApp({ path: '/w/ws-1/links', registry: REGISTRY });
    const ownerNav = await screen.findByRole('navigation', {
      name: 'Workspace',
    });
    expect(
      within(ownerNav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Links', 'Members']);
    owner.unmount();

    renderApp({ path: '/w/ws-2/links', registry: REGISTRY });
    const memberNav = await screen.findByRole('navigation', {
      name: 'Workspace',
    });
    expect(
      within(memberNav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Links']);
  });

  it('lists the account pages outside a workspace', async () => {
    renderApp({ path: '/account/profile', registry: REGISTRY });

    await heading('Profile of Ada Lovelace');
    const nav = screen.getByRole('navigation', { name: 'Account' });
    expect(within(nav).getByRole('link', { name: 'Profile' })).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).toBeNull();
  });

  it('opens a link on its first tab, under the feature-provided heading', async () => {
    const { router } = renderApp({
      path: '/w/ws-1/links/link-9',
      registry: REGISTRY,
    });

    await heading('Link link-9');
    expect(
      await screen.findByText('Analytics of link-9 in ws-1'),
    ).toBeDefined();
    expect(router.state.location.pathname).toBe(
      '/w/ws-1/links/link-9/analytics',
    );
    const tabs = screen.getByRole('navigation', { name: 'Link sections' });
    expect(
      within(tabs)
        .getByRole('link', { name: 'Analytics' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('shows a plain link frame while no feature contributes to it', async () => {
    renderApp({
      path: '/w/ws-1/links/link-9',
      registry: { ...REGISTRY, linkTabs: [], LinkHeader: null },
    });

    await heading('Link');
    expect(screen.getByText('Nothing to show yet')).toBeDefined();
    expect(
      screen.queryByRole('navigation', { name: 'Link sections' }),
    ).toBeNull();
  });

  it('ends the session when any request answers 401', async () => {
    const { router } = renderApp({
      path: '/w/ws-1/protected',
      registry: REGISTRY,
      handlers: {
        'GET /protected': () =>
          errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue'),
      },
    });

    await heading('Sign in');
    expect(router.state.location.search).toBe('?next=%2Fw%2Fws-1%2Fprotected');
  });

  it('keeps the navigation up when a page fails to render', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      // React reports the render error it caught; the test expects it.
    });

    renderApp({ path: '/w/ws-1/broken', registry: REGISTRY });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'This page ran into a problem',
    );
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeDefined();
    consoleError.mockRestore();
  });

  it('signs out through the API, then leaves for the sign-in page', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp({
      path: '/w/ws-1/links',
      registry: REGISTRY,
      handlers: { 'POST /auth/sign-out': () => emptyResponse() },
    });
    await heading('Links of Acme');

    await user.click(screen.getByRole('button', { name: /^Account:\s*Ada/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith('/sign-in'));
    expect(
      requests.map((request) => `${request.method} ${request.path}`),
    ).toContain('POST /auth/sign-out');
  });

  it('stays signed in, and says why, when signing out fails', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/w/ws-1/links',
      registry: REGISTRY,
      handlers: {
        'POST /auth/sign-out': () =>
          errorResponse(503, 'SERVICE_UNAVAILABLE', 'Down'),
      },
    });
    await heading('Links of Acme');

    await user.click(screen.getByRole('button', { name: /^Account:\s*Ada/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    const notifications = screen.getByRole('region', { name: 'Notifications' });
    await waitFor(() =>
      expect(notifications.textContent).toContain('Could not sign out.'),
    );
    expect(leaveTo).not.toHaveBeenCalled();
  });
});
