import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router';
import { NotFoundState } from '../pages/not-found.js';
import { useSession } from '../session/session-context.js';
import { rememberWorkspace } from './last-workspace.js';
import { WorkspaceContext } from './workspace-context.js';

/**
 * Resolves the workspace named in the address against the user's
 * memberships. A workspace the user is not in looks exactly like one that
 * does not exist, as it does in the API.
 */
export function WorkspaceBoundary() {
  const { workspaceId } = useParams();
  const session = useSession();
  const workspace = session.workspaces.find(({ id }) => id === workspaceId);
  const openWorkspaceId = workspace?.id;

  useEffect(() => {
    if (openWorkspaceId !== undefined) {
      rememberWorkspace(openWorkspaceId);
    }
  }, [openWorkspaceId]);

  if (workspace === undefined) {
    return (
      <NotFoundState
        title="Workspace not found"
        description="It may have been deleted, or you may no longer be a member."
      />
    );
  }
  return (
    <WorkspaceContext value={workspace}>
      <Outlet />
    </WorkspaceContext>
  );
}
