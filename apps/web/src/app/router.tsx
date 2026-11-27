import { Outlet, ScrollRestoration, type RouteObject } from 'react-router';
import { AppLayout } from './layout/AppLayout.js';
import { AuthLayout } from './layout/AuthLayout.js';
import {
  LinkDetailFrame,
  linkTabRoutes,
} from './link-detail/LinkDetailFrame.js';
import { HomeRedirect, WorkspaceHome } from './pages/home.js';
import { NotFoundPage, NotFoundState } from './pages/not-found.js';
import { RouteErrorPage, RouteErrorState } from './pages/route-error.js';
import { WORKSPACE_ROUTE } from './paths.js';
import type { Registry } from './registry/collect.js';
import { RequireSession } from './session/RequireSession.js';
import { WorkspaceBoundary } from './workspace/WorkspaceBoundary.js';

/** The address of the link detail frame, under a workspace. */
const LINK_ROUTE = 'links/:linkId';

function Root() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}

function workspaceRoutes(registry: Registry): RouteObject {
  return {
    path: WORKSPACE_ROUTE,
    element: <WorkspaceBoundary />,
    children: [
      { index: true, element: <WorkspaceHome nav={registry.workspaceNav} /> },
      ...registry.workspaceRoutes,
      {
        path: LINK_ROUTE,
        element: (
          <LinkDetailFrame
            tabs={registry.linkTabs}
            LinkHeader={registry.LinkHeader}
          />
        ),
        children: linkTabRoutes(registry.linkTabs),
      },
      { path: '*', element: <NotFoundState /> },
    ],
  };
}

function signedInRoutes(registry: Registry): RouteObject {
  return {
    element: <RequireSession />,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        element: (
          <AppLayout
            workspaceNav={registry.workspaceNav}
            accountNav={registry.accountNav}
          />
        ),
        children: [
          {
            // Inside the layout, so a page that fails leaves the navigation up.
            ErrorBoundary: RouteErrorState,
            children: [...registry.accountRoutes, workspaceRoutes(registry)],
          },
        ],
      },
    ],
  };
}

/**
 * The dashboard's whole route tree: the shell's own frames, with every
 * feature's pages slotted into the area it asked for.
 */
export function buildRoutes(registry: Registry): RouteObject[] {
  return [
    {
      element: <Root />,
      ErrorBoundary: RouteErrorPage,
      children: [
        { element: <AuthLayout />, children: registry.publicRoutes },
        signedInRoutes(registry),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
