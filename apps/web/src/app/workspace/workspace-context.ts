import { createContext, useContext } from 'react';
import type { SessionWorkspace } from '../../api/session.js';

export const WorkspaceContext = createContext<SessionWorkspace | null>(null);

/**
 * The workspace named in the address, with the user's role in it. Available
 * on every workspace page; use its `id` to build API paths.
 */
export function useWorkspace(): SessionWorkspace {
  const workspace = useContext(WorkspaceContext);
  if (workspace === null) {
    throw new Error('useWorkspace() is only available on workspace pages');
  }
  return workspace;
}
