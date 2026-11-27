import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '../../ui/index.js';
import { MenuIcon } from '../../ui/icons.js';
import { useModalDialog } from '../../ui/use-modal-dialog.js';

/**
 * From this width up the layout shows the sidebar and hides the panel's
 * button. It is Tailwind's `md` breakpoint, which AppLayout switches on.
 */
const WIDE_SCREEN_QUERY = '(min-width: 48rem)';

/** What ends a visit to the panel: a link, or a choice from one of its menus. */
const CHOICE_SELECTOR = 'a, [role="menuitem"]';

/**
 * A screen that grows wide, by rotating or resizing, hides the panel along
 * with its button. Left open it would keep the page behind it locked, with
 * nothing on screen to close it.
 */
function useCloseOnWideScreen(close: () => void) {
  useEffect(() => {
    const wideScreen = window.matchMedia(WIDE_SCREEN_QUERY);
    wideScreen.addEventListener('change', close);
    return () => wideScreen.removeEventListener('change', close);
  }, [close]);
}

/**
 * The navigation on a narrow screen: a button that opens it as a panel from
 * the left edge.
 */
export function NavDrawer(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [close] = useState(() => () => setOpen(false));
  const dialogProps = useModalDialog(open, close);
  useCloseOnWideScreen(close);

  // The panel closes on the press rather than on arrival, so it also closes
  // for the page already open, and for an action whose result, such as a
  // failure message, shows on the page behind it.
  const closeOnChoice = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest(CHOICE_SELECTOR) !== null) {
      close();
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-200"
      >
        <MenuIcon />
      </button>
      <dialog
        {...dialogProps}
        aria-label="Navigation"
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/60"
      >
        {open ? (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1" onClick={closeOnChoice}>
              {props.children}
            </div>
            <div className="border-t border-slate-200 p-4">
              <Button className="w-full" onClick={close}>
                Close navigation
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
