import type { SessionWorkspace } from '../../api/session.js';
import { Menu, MenuLink, MenuSeparator } from '../../ui/index.js';
import { ChevronUpDownIcon } from '../../ui/icons.js';
import { paths } from '../paths.js';
import { useSession } from '../session/session-context.js';

const BUTTON_CLASSES =
  'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-left text-sm font-medium text-slate-900 hover:bg-slate-100';

/** Shows the open workspace and switches to another, or to creating one. */
export function WorkspaceSwitcher(props: { current: SessionWorkspace | null }) {
  const { workspaces } = useSession();
  const { current } = props;
  return (
    <Menu
      label="Workspaces"
      buttonClassName={BUTTON_CLASSES}
      button={
        <>
          <span className="min-w-0 truncate">
            <span className="sr-only">Workspace: </span>
            {current?.name ?? 'Select a workspace'}
          </span>
          <ChevronUpDownIcon className="size-4 text-slate-600" />
        </>
      }
    >
      {workspaces.map((workspace) => (
        <MenuLink
          key={workspace.id}
          to={paths.workspace(workspace.id)}
          selected={workspace.id === current?.id}
        >
          {workspace.name}
        </MenuLink>
      ))}
      {workspaces.length > 0 ? <MenuSeparator /> : null}
      <MenuLink to={paths.createWorkspace}>Create workspace</MenuLink>
    </Menu>
  );
}
