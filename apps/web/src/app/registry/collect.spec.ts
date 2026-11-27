import { describe, expect, it } from 'vitest';
import { collectRegistry, EMPTY_REGISTRY } from './collect.js';
import type { FeatureRoutes } from './feature-routes.js';
import type { LinkTabsModule } from './link-tabs.js';

function Page() {
  return null;
}

function routesModule(routes: FeatureRoutes) {
  return { routes };
}

describe('collectRegistry', () => {
  it('is empty when no feature exists yet', () => {
    expect(collectRegistry({}, {})).toEqual(EMPTY_REGISTRY);
  });

  it('merges the routes of every feature into the area each asked for', () => {
    const registry = collectRegistry(
      {
        '/src/features/links/routes.tsx': routesModule({
          workspace: [{ path: 'links', Component: Page }],
        }),
        '/src/features/auth/routes.tsx': routesModule({
          public: [{ path: 'sign-in', Component: Page }],
          account: [{ path: 'account/profile', Component: Page }],
        }),
      },
      {},
    );

    expect(registry.publicRoutes.map((route) => route.path)).toEqual([
      'sign-in',
    ]);
    expect(registry.accountRoutes.map((route) => route.path)).toEqual([
      'account/profile',
    ]);
    expect(registry.workspaceRoutes.map((route) => route.path)).toEqual([
      'links',
    ]);
  });

  it('orders navigation by `order`, whatever order the files were found in', () => {
    const registry = collectRegistry(
      {
        '/src/features/domains/routes.tsx': routesModule({
          workspaceNav: [{ label: 'Domains', to: 'domains', order: 30 }],
        }),
        '/src/features/analytics/routes.tsx': routesModule({
          workspaceNav: [{ label: 'Overview', to: 'overview', order: 20 }],
          accountNav: [{ label: 'Profile', to: '/account/profile', order: 10 }],
        }),
        '/src/features/links/routes.tsx': routesModule({
          workspaceNav: [{ label: 'Links', to: 'links', order: 10 }],
        }),
      },
      {},
    );

    expect(registry.workspaceNav.map((item) => item.label)).toEqual([
      'Links',
      'Overview',
      'Domains',
    ]);
    expect(registry.accountNav.map((item) => item.label)).toEqual(['Profile']);
  });

  it('orders link tabs by `order` and takes the one link header', () => {
    const qr: LinkTabsModule = {
      linkTabs: [
        { id: 'qr-code', label: 'QR code', order: 20, Component: Page },
      ],
    };
    const analytics: LinkTabsModule = {
      linkTabs: [
        { id: 'analytics', label: 'Analytics', order: 10, Component: Page },
      ],
    };
    const links: LinkTabsModule = { LinkHeader: Page };

    const registry = collectRegistry(
      {},
      {
        '/src/features/qr/link-tabs.tsx': qr,
        '/src/features/analytics/link-tabs.tsx': analytics,
        '/src/features/links/link-tabs.tsx': links,
      },
    );

    expect(registry.linkTabs.map((tab) => tab.id)).toEqual([
      'analytics',
      'qr-code',
    ]);
    expect(registry.LinkHeader).toBe(Page);
  });

  it('names the file of a routes module that exports nothing usable', () => {
    expect(() =>
      collectRegistry(
        { '/src/features/links/routes.tsx': { default: Page } },
        {},
      ),
    ).toThrow('/src/features/links/routes.tsx must export `routes`');
  });

  it('names the file of a link-tabs module that exports nothing usable', () => {
    expect(() =>
      collectRegistry({}, { '/src/features/qr/link-tabs.tsx': { tabs: [] } }),
    ).toThrow('/src/features/qr/link-tabs.tsx must export `linkTabs`');
  });

  it('refuses two tabs with one id, naming both files', () => {
    const module: LinkTabsModule = {
      linkTabs: [{ id: 'qr-code', label: 'QR', order: 1, Component: Page }],
    };

    expect(() =>
      collectRegistry(
        {},
        {
          '/src/features/a/link-tabs.tsx': module,
          '/src/features/b/link-tabs.tsx': module,
        },
      ),
    ).toThrow(
      '/src/features/b/link-tabs.tsx: link tab id "qr-code" is already used by /src/features/a/link-tabs.tsx',
    );
  });

  it('refuses a tab id that would not make a clean address', () => {
    const module: LinkTabsModule = {
      linkTabs: [{ id: 'QR Code', label: 'QR', order: 1, Component: Page }],
    };

    expect(() =>
      collectRegistry({}, { '/src/features/qr/link-tabs.tsx': module }),
    ).toThrow('link tab id "QR Code" must be lowercase');
  });

  it('refuses a second link header', () => {
    const module: LinkTabsModule = { LinkHeader: Page };

    expect(() =>
      collectRegistry(
        {},
        {
          '/src/features/a/link-tabs.tsx': module,
          '/src/features/b/link-tabs.tsx': module,
        },
      ),
    ).toThrow('Only one feature may export LinkHeader');
  });
});
