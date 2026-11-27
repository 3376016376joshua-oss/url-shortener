import { Suspense, type ComponentType } from 'react';
import { Link, Navigate, Outlet, type RouteObject } from 'react-router';
import {
  EmptyState,
  LoadingState,
  PageHeader,
  TabNav,
} from '../../ui/index.js';
import { ArrowLeftIcon } from '../../ui/icons.js';
import { NotFoundState } from '../pages/not-found.js';
import { paths } from '../paths.js';
import type { LinkTab } from '../registry/link-tabs.js';
import { useWorkspace } from '../workspace/workspace-context.js';

export interface LinkDetailFrameProps {
  tabs: ReadonlyArray<LinkTab>;
  /** The link's own heading, when a feature provides one. */
  LinkHeader: ComponentType | null;
}

/**
 * The page of one link: the way back to the list, the link's heading, and
 * a tab for each thing that can be done with it. The tabs and the heading
 * come from the features; the frame only arranges them.
 */
export function LinkDetailFrame(props: LinkDetailFrameProps) {
  const workspace = useWorkspace();
  const { LinkHeader } = props;
  return (
    <>
      <Link
        to={paths.links(workspace.id)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-700 hover:text-slate-900"
      >
        <ArrowLeftIcon className="size-4" />
        Links
      </Link>
      <Suspense fallback={<LoadingState label="Loading the link" />}>
        {LinkHeader === null ? <PageHeader title="Link" /> : <LinkHeader />}
      </Suspense>
      {props.tabs.length > 0 ? (
        <TabNav
          label="Link sections"
          tabs={props.tabs.map((tab) => ({ to: tab.id, label: tab.label }))}
        />
      ) : null}
      <Suspense fallback={<LoadingState />}>
        <Outlet />
      </Suspense>
    </>
  );
}

/** The frame's child routes: one per tab, opening on the first. */
export function linkTabRoutes(tabs: ReadonlyArray<LinkTab>): RouteObject[] {
  const first = tabs[0];
  const index: RouteObject =
    first === undefined
      ? {
          index: true,
          element: (
            <EmptyState
              title="Nothing to show yet"
              description="This link has no sections to show."
            />
          ),
        }
      : { index: true, element: <Navigate replace to={first.id} /> };
  return [
    index,
    ...tabs.map((tab) => ({ path: tab.id, Component: tab.Component })),
    { path: '*', element: <NotFoundState /> },
  ];
}
