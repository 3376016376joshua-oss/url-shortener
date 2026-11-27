import type { SessionWorkspace } from '../../api/session.js';
import { paths } from '../paths.js';
import type { NavItem } from '../registry/feature-routes.js';
import { roleAtLeast } from './roles.js';

export interface ResolvedNavItem {
  label: string;
  /** The full address of the entry. */
  to: string;
}

/** The sidebar entries a member of `workspace` may see, with full addresses. */
export function resolveWorkspaceNav(
  nav: ReadonlyArray<NavItem>,
  workspace: SessionWorkspace,
): ResolvedNavItem[] {
  return nav
    .filter((item) => roleAtLeast(workspace.role, item.minRole ?? 'member'))
    .map((item) => ({
      label: item.label,
      to: `${paths.workspace(workspace.id)}/${item.to}`,
    }));
}
