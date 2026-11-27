import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageHeader } from '../ui/index.js';
import {
  useLinkParams,
  useSession,
  useWorkspace,
  type FeatureRoutes,
  type LinkTabsModule,
} from './shell.js';
import { renderApp, TEST_SESSION } from './testing/render-app.js';

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

function AnalyticsTab() {
  const { workspaceId, linkId } = useLinkParams();
  return <p>{`Analytics of ${linkId} in ${workspaceId}`}</p>;
}

function LinkHeader() {
  return <PageHeader title={`Link ${useLinkParams().linkId}`} />;
}

const FEATURE: FeatureRoutes = {
  account: [{ path: 'account/profile', Component: ProfilePage }],
  workspace: [
    { path: 'links', Component: LinksPage },
    { path: 'broken', Component: BrokenPage },
  ],
  accountNav: [{ label: 'Profile', to: '/account/profile', order: 10 }],
  workspaceNav: [
    { label: 'Links', to: 'links', order: 10 },
    { label: 'Members', to: 'members', order: 20, minRole: 'admin' },
  ],
};

const LINK_TABS: LinkTabsModule = {
  linkTabs: [
    { id: 'analytics', label: 'Analytics', order: 10, Component: AnalyticsTab },
    { id: 'qr-code', label: 'QR code', order: 20, Component: () => <p>QR</p> },
  ],
  LinkHeader,
};

function heading(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

async function workspaceNavLabels() {
  const nav = await screen.findByRole('navigation', { name: 'Workspace' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('the dashboard routes', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('opens the first section of the first workspace', async () => {
    const { router } = renderApp({ path: '/', features: [FEATURE] });

    await heading('Links of Acme');
    expect(router.state.location.pathname).toBe('/w/ws-1/links');
  });

  it('reopens the workspace that was open last', async () => {
    const first = renderApp({ path: '/w/ws-2/links', features: [FEATURE] });
    await heading('Links of Globex');
    first.unmount();

    const { router } = renderApp({ path: '/', features: [FEATURE] });

    await heading('Links of Globex');
    expect(router.state.location.pathname).toBe('/w/ws-2/links');
  });

  it('sends a user with no workspace to create one', async () => {
    const { router } = renderApp({
      path: '/',
      features: [FEATURE],
      session: { ...TEST_SESSION, workspaces: [] },
    });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workspaces/new'),
    );
  });

  it('hides a workspace the user is not in behind "not found"', async () => {
    renderApp({ path: '/w/ws-other/links', features: [FEATURE] });

    await heading('Workspace not found');
  });

  it('shows a section only to the roles allowed to use it', async () => {
    const owner = renderApp({ path: '/w/ws-1/links', features: [FEATURE] });
    expect(await workspaceNavLabels()).toEqual(['Links', 'Members']);
    owner.unmount();

    renderApp({ path: '/w/ws-2/links', features: [FEATURE] });
    expect(await workspaceNavLabels()).toEqual(['Links']);
  });

  it('lists the account pages outside a workspace', async () => {
    renderApp({ path: '/account/profile', features: [FEATURE] });

    await heading('Profile of Ada Lovelace');
    const nav = screen.getByRole('navigation', { name: 'Account' });
    expect(within(nav).getByRole('link', { name: 'Profile' })).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).toBeNull();
  });

  it('shows a workspace without sections as empty, not as an error', async () => {
    renderApp({ path: '/w/ws-1' });

    await heading('Acme');
    expect(screen.getByText('Nothing here yet')).toBeDefined();
  });

  it('opens a link on its first tab, under the feature-provided heading', async () => {
    const { router } = renderApp({
      path: '/w/ws-1/links/link-9',
      features: [FEATURE],
      linkTabs: [LINK_TABS],
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
    renderApp({ path: '/w/ws-1/links/link-9', features: [FEATURE] });

    await heading('Link');
    expect(screen.getByText('Nothing to show yet')).toBeDefined();
    expect(
      screen.queryByRole('navigation', { name: 'Link sections' }),
    ).toBeNull();
  });

  it('keeps the navigation up when a page fails to render', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      // React reports the render error it caught; the test expects it.
    });

    renderApp({ path: '/w/ws-1/broken', features: [FEATURE] });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'This page ran into a problem',
    );
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeDefined();
    consoleError.mockRestore();
  });
});
