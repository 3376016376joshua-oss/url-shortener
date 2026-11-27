import { Menu, MenuItem, MenuLink, MenuSeparator } from '../../ui/index.js';
import { ChevronUpDownIcon } from '../../ui/icons.js';
import type { NavItem } from '../registry/feature-routes.js';
import { useSession } from '../session/session-context.js';
import { useSignOut } from '../session/use-sign-out.js';

const BUTTON_CLASSES =
  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-100';

/** Who is signed in, with the way to their account pages and to sign out. */
export function UserMenu(props: { accountNav: ReadonlyArray<NavItem> }) {
  const { user } = useSession();
  const { signOut, isSigningOut } = useSignOut();
  return (
    <Menu
      label="Account"
      side="top"
      buttonClassName={BUTTON_CLASSES}
      button={
        <>
          <span className="min-w-0">
            <span className="sr-only">Account: </span>
            <span className="block truncate text-sm font-medium text-slate-900">
              {user.name}
            </span>
            <span className="block truncate text-xs text-slate-600">
              {user.email}
            </span>
          </span>
          <ChevronUpDownIcon className="size-4 text-slate-600" />
        </>
      }
    >
      {props.accountNav.map((item) => (
        <MenuLink key={item.to} to={item.to}>
          {item.label}
        </MenuLink>
      ))}
      {props.accountNav.length > 0 ? <MenuSeparator /> : null}
      <MenuItem onSelect={signOut}>
        {isSigningOut ? 'Signing out' : 'Sign out'}
      </MenuItem>
    </Menu>
  );
}
