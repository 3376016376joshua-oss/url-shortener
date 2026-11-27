import { NavLink, type To } from 'react-router';
import { cx } from './cx.js';
import { KEEP_FOCUS_STATE } from './navigation-focus.js';

export interface TabNavItem {
  to: To;
  label: string;
}

export interface TabNavProps {
  /** Names the navigation for assistive technology, for example "Link sections". */
  label: string;
  tabs: ReadonlyArray<TabNavItem>;
}

/**
 * Tabs that are pages: each one is a link with its own address, so a tab can
 * be bookmarked and the back button works. The current one is marked.
 */
export function TabNav(props: TabNavProps) {
  return (
    <nav
      aria-label={props.label}
      className="mb-6 overflow-x-auto border-b border-slate-300"
    >
      <ul className="flex gap-1">
        {props.tabs.map((tab) => (
          <li key={tab.label}>
            <NavLink
              to={tab.to}
              state={KEEP_FOCUS_STATE}
              className={({ isActive }) =>
                cx(
                  '-mb-px block border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap -outline-offset-2',
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-700 hover:border-slate-400 hover:text-slate-900',
                )
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
