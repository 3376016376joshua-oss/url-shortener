import { useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '../../ui/index.js';
import { MenuIcon } from '../../ui/icons.js';
import { useModalDialog } from '../../ui/use-modal-dialog.js';

/**
 * The navigation on a narrow screen: a button that opens it as a panel from
 * the left edge.
 */
export function NavDrawer(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialogProps = useModalDialog(open, () => setOpen(false));

  // Following any link in the panel is a navigation, including to the page
  // already open, so the panel closes on the press rather than on arrival.
  const closeOnLinkPress = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('a') !== null) {
      setOpen(false);
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
            <div className="min-h-0 flex-1" onClick={closeOnLinkPress}>
              {props.children}
            </div>
            <div className="border-t border-slate-200 p-4">
              <Button className="w-full" onClick={() => setOpen(false)}>
                Close navigation
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
