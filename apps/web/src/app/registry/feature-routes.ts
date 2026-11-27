import type { RouteObject } from 'react-router';
import type { WorkspaceRole } from '../../api/session.js';

/** An entry in the sidebar or the account menu. */
export interface NavItem {
  label: string;
  /**
   * For `workspaceNav`, a path under the workspace, for example `links`.
   * For `accountNav`, a path from the site root, for example `/account/profile`.
   */
  to: string;
  /** Lower comes first. Leave gaps so another feature can slot in between. */
  order: number;
  /** Hides the entry from members below this role. Workspace navigation only. */
  minRole?: WorkspaceRole;
}

/**
 * What a feature contributes to the dashboard, exported as `routes` from
 * `src/features/<feature>/routes.tsx`. Every part is optional.
 */
export interface FeatureRoutes {
  /**
   * Pages for visitors who are not signed in, shown in the centred auth
   * layout. Paths are from the site root: `sign-in`.
   */
  public?: RouteObject[];
  /**
   * Pages for a signed-in user outside any workspace, shown in the app
   * layout. Paths are from the site root: `account/profile`.
   */
  account?: RouteObject[];
  /**
   * Pages of one workspace, shown in the app layout under
   * `/w/:workspaceId`. Paths are relative to it: `links`, `domains/:domainId`.
   */
  workspace?: RouteObject[];
  /** Entries in the account menu. */
  accountNav?: NavItem[];
  /** Entries in the sidebar while a workspace is open. */
  workspaceNav?: NavItem[];
}
