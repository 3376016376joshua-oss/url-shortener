import { Link, NavLink, useMatch } from 'react-router';
import { Brand, cx } from '../../ui/index.js';
import { paths, WORKSPACE_ROUTE } from '../paths.js';
import type { NavItem } from '../registry/feature-routes.js';
import { useSession } from '../session/session-context.js';
import {
  resolveWorkspaceNav,
  type ResolvedNavItem,
} from '../workspace/workspace-nav.js';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher.js';
import { UserMenu } from './UserMenu.js';

export interface SidebarProps {
  workspaceNav: ReadonlyArray<NavItem>;
  accountNav: ReadonlyArray<NavItem>;
}

function NavList(props: { label: string; items: ResolvedNavItem[] }) {
  if (props.items.length === 0) {
    // Keeps the account menu at the bottom without an empty landmark.
    return <div className="flex-1" />;
  }
  return (
    <nav aria-label={props.label} className="min-h-0 flex-1 overflow-y-auto">
      <ul className="flex flex-col gap-0.5">
        {props.items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cx(
                  'block rounded-md px-3 py-2 text-sm',
                  isActive
                    ? 'bg-indigo-50 font-semibold text-indigo-800'
                    : 'font-medium text-slate-700 hover:bg-slate-100',
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The dashboard's navigation: the workspace switcher, the open workspace's
 * sections, and the account menu. Outside a workspace it lists the account
 * pages instead.
 */
export function Sidebar(props: SidebarProps) {
  const session = useSession();
  const openWorkspaceId = useMatch(`/${WORKSPACE_ROUTE}/*`)?.params.workspaceId;
  const workspace =
    session.workspaces.find(({ id }) => id === openWorkspaceId) ?? null;
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link to={paths.home} className="self-start rounded-md">
        <Brand />
      </Link>
      <WorkspaceSwitcher current={workspace} />
      {workspace === null ? (
        <NavList label="Account" items={[...props.accountNav]} />
      ) : (
        <NavList
          label="Workspace"
          items={resolveWorkspaceNav(props.workspaceNav, workspace)}
        />
      )}
      <div className="border-t border-slate-200 pt-3">
        <UserMenu accountNav={props.accountNav} />
      </div>
    </div>
  );
}
