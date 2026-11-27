# The dashboard shell

The shell is everything a feature should not have to build: routing, the layouts, the session, the workspace switcher, the API client, and the component kit.
A feature plugs in by adding files under `src/features/<feature>/`. It never edits a file in `src/app`, `src/ui`, or `src/api`, and it never imports another feature.

## What a feature may import

| From               | What                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `src/app/shell.ts` | `paths`, `useSession()`, `useWorkspace()`, `useLinkParams()`, `roleAtLeast()`, `resolveNextPath()`, and the registry types |
| `src/ui/index.ts`  | The component kit                                                                                                          |
| `src/api`          | `useApiClient()`, `ApiError`, `describeError()`, `sessionQueryKey`                                                         |
| `src/app/testing`  | `renderApp()`, for tests only                                                                                              |
| `src/api/testing`  | `jsonResponse()`, `errorResponse()`, `emptyResponse()`, for tests only                                                     |

Nothing else in `src/app` is for features.

## Adding pages: `routes.tsx`

`src/features/<feature>/routes.tsx` exports `routes`. The shell discovers the file at build time; there is no list to add it to.

```tsx
import type { FeatureRoutes } from '../../app/shell.js';
import { DomainListPage } from './DomainListPage.js';

export const routes: FeatureRoutes = {
  workspace: [{ path: 'domains', Component: DomainListPage }],
  workspaceNav: [
    { label: 'Domains', to: 'domains', order: 30, minRole: 'admin' },
  ],
};
```

| Key            | Where the pages appear                                   | Paths are                                         |
| -------------- | -------------------------------------------------------- | ------------------------------------------------- |
| `public`       | The centred auth layout, signed in or not                | From the site root: `sign-in`                     |
| `account`      | The app layout, signed in, outside any workspace         | From the site root: `account/profile`             |
| `workspace`    | The app layout, under `/w/:workspaceId`, members only    | Relative to the workspace: `links`, `domains/:id` |
| `workspaceNav` | The sidebar while a workspace is open, sorted by `order` | Relative to the workspace                         |
| `accountNav`   | The account menu, and the sidebar outside a workspace    | From the site root: `/account/profile`            |

Routes are React Router route objects, so `lazy`, `children`, and `index` all work.

The shell links to three addresses it does not serve itself, and expects a feature to register a page at each:

| Address                     | Registered as               | Used by                                              |
| --------------------------- | --------------------------- | ---------------------------------------------------- |
| `/sign-in` (`paths.signIn`) | `public: 'sign-in'`         | The redirect of a signed-out visitor                 |
| `/workspaces/new`           | `account: 'workspaces/new'` | The workspace switcher, and a user with no workspace |
| `/w/:workspaceId/links`     | `workspace: 'links'`        | The link detail frame's way back                     |

The shell sends a signed-out visitor to `/sign-in?next=<where they were going>`. After a successful sign-in, invalidate `sessionQueryKey` and navigate to `resolveNextPath(location.search)`, which ignores anything that is not a path on this site.

## Adding to the link page: `link-tabs.tsx`

The shell owns `/w/:workspaceId/links/:linkId`: the way back to the list, a heading, and the tabs. `src/features/<feature>/link-tabs.tsx` contributes to it.

```tsx
import type { LinkTab } from '../../app/shell.js';
import { AnalyticsTab } from './AnalyticsTab.js';

export const linkTabs: LinkTab[] = [
  { id: 'analytics', label: 'Analytics', order: 10, Component: AnalyticsTab },
];
```

- A tab lives at `/w/:workspaceId/links/:linkId/<id>`. The tab with the lowest `order` is the one a link opens on.
- A tab reads which link it is for with `useLinkParams()`.
- One feature may also export `LinkHeader`, a component that replaces the frame's plain heading with the link's own. It must render a `PageHeader`.
- `Component` may be `React.lazy`; the frame shows a loading state meanwhile.

## The rules every view follows

These are requirement DB-6, and the kit is built so that following them is the easy path.

- **Start with `PageHeader`.** It renders the page's one `<h1>` and sets the browser tab's title.
- **Render queries through `QueryView`,** which shows the loading, error, and empty states so a view cannot forget one. For anything else use `LoadingState`, `EmptyState`, and `ErrorState` directly.
- **Pass errors, not messages.** `ErrorState` and `describeError()` turn whatever was thrown into words, with the request id.
- **Ask before destroying.** Use `ConfirmDialog` for anything that cannot be undone.
- **Call the API through `useApiClient()` only.** It attaches the session, validates the response against the Zod schema you pass, raises typed errors, and ends the session on a `401`.
- **Use the kit's controls** (`Button`, `TextField`, `SelectField`, `Menu`, `DataTable`, `TabNav`) rather than raw elements: they carry the labels, focus handling, and contrast.
- **Lay out for 360 px first.** Wide content goes in a `DataTable` or its own `overflow-x-auto` box; the page itself must never scroll sideways.

## Testing a feature

Unit tests render the whole dashboard in memory with the feature plugged in:

```tsx
import { renderApp } from '../../app/testing/render-app.js';
import { jsonResponse } from '../../api/testing/fake-fetch.js';
import { routes } from './routes.js';

renderApp({
  path: '/w/ws-1/domains',
  registry: {
    workspaceRoutes: routes.workspace,
    workspaceNav: routes.workspaceNav,
  },
  handlers: {
    'GET /workspaces/ws-1/domains': () =>
      jsonResponse({ items: [], nextCursor: null }),
  },
});
```

`renderApp` signs in as an owner of `ws-1` ("Acme") and a member of `ws-2` ("Globex") unless told otherwise, and a request to an endpoint without a handler fails the test.

Browser tests live in `apps/web/e2e` and run with `pnpm --filter @url-shortener/web test:e2e`. `e2e/support/test.ts` provides the `expectAccessible()` and `expectNoSidewaysScroll()` checks, and every spec runs on a desktop viewport and on a 360 px one.
The specs in `e2e/shell` cover the shell alone: they build the dashboard in the `e2e` mode, where the fixture features of `e2e/fixtures/features` stand in for `src/features`, and each test answers the API itself.

## The session

The shell reads the session from `GET /api/v1/me` through the schema in `src/api/session.ts`: the user's `id`, `email`, and `name`, and for each workspace its `id`, `name`, and `role`. Any other field is ignored.
