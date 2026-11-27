import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Brand } from '../../ui/index.js';
import { keepsFocus } from '../../ui/navigation-focus.js';
import { paths } from '../paths.js';
import { NavDrawer } from './NavDrawer.js';
import { Sidebar, type SidebarProps } from './Sidebar.js';

const MAIN_ID = 'main-content';

/**
 * A page change in a single-page app is silent to a screen reader and
 * leaves keyboard focus on the link that was followed. Moving focus to the
 * main region on each navigation does what a page load would have done.
 */
function useFocusOnNavigation() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (previousPath.current === location.pathname) {
      return;
    }
    previousPath.current = location.pathname;
    if (!keepsFocus(location.state)) {
      mainRef.current?.focus();
    }
  }, [location]);

  return mainRef;
}

/**
 * The frame around every signed-in page: navigation in a sidebar on a wide
 * screen and behind a button on a narrow one, and the page in the main region.
 */
export function AppLayout(props: SidebarProps) {
  const mainRef = useFocusOnNavigation();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-30 rounded-md bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-lg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 md:hidden">
        <Link to={paths.home} className="rounded-md">
          <Brand />
        </Link>
        <NavDrawer>
          <Sidebar {...props} />
        </NavDrawer>
      </header>
      <aside className="sticky top-0 hidden h-dvh border-r border-slate-200 bg-white md:block">
        <Sidebar {...props} />
      </aside>
      <main
        ref={mainRef}
        id={MAIN_ID}
        tabIndex={-1}
        className="min-w-0 outline-none"
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
