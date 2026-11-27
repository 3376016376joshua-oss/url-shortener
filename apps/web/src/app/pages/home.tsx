import { Navigate } from 'react-router';
import { EmptyState, PageHeader } from '../../ui/index.js';
import { paths } from '../paths.js';
import type { NavItem } from '../registry/feature-routes.js';
import { useSession } from '../session/session-context.js';
import { recallWorkspace } from '../workspace/last-workspace.js';
import { useWorkspace } from '../workspace/workspace-context.js';
import { resolveWorkspaceNav } from '../workspace/workspace-nav.js';

/** `/`: reopens the workspace used last, or the first one. */
export function HomeRedirect() {
  const { workspaces } = useSession();
  const lastId = recallWorkspace();
  const workspace = workspaces.find(({ id }) => id === lastId) ?? workspaces[0];
  const destination =
    workspace === undefined
      ? paths.createWorkspace
      : paths.workspace(workspace.id);
  return <Navigate replace to={destination} />;
}

/** `/w/:workspaceId`: opens the first section the member may see. */
export function WorkspaceHome(props: { nav: ReadonlyArray<NavItem> }) {
  const workspace = useWorkspace();
  const first = resolveWorkspaceNav(props.nav, workspace)[0];
  if (first !== undefined) {
    return <Navigate replace to={first.to} />;
  }
  return (
    <>
      <PageHeader title={workspace.name} />
      <EmptyState
        title="Nothing here yet"
        description="This workspace has no sections to show."
      />
    </>
  );
}
