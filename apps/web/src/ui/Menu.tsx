import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, type To } from 'react-router';
import { cx } from './cx.js';
import { CheckIcon } from './icons.js';

const ITEM_SELECTOR = '[role^="menuitem"]';

const ITEM_CLASSES =
  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 focus-visible:bg-slate-100';

/** Closes the menu the item sits in. */
const MenuCloseContext = createContext<() => void>(() => undefined);

function focusItem(
  list: HTMLElement,
  pick: (count: number, at: number) => number,
) {
  const items = Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
  const current = items.findIndex((item) => item === document.activeElement);
  items[pick(items.length, current)]?.focus();
}

function useCloseOnOutsidePress(
  rootRef: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePress = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        rootRef.current?.contains(target) !== true
      ) {
        close();
      }
    };
    document.addEventListener('pointerdown', handlePress);
    return () => document.removeEventListener('pointerdown', handlePress);
  }, [rootRef, open, close]);
}

interface MenuListProps {
  id: string;
  label: string;
  className: string;
  /** Closes the menu and puts focus back on its button. */
  dismiss: () => void;
  close: () => void;
  children: ReactNode;
}

function MenuList(props: MenuListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    const moves: Record<string, (count: number, at: number) => number> = {
      ArrowDown: (count, at) => (at + 1) % count,
      ArrowUp: (count, at) => (at - 1 + count) % count,
      Home: () => 0,
      End: (count) => count - 1,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      focusItem(list, move);
    } else if (event.key === 'Escape') {
      // Escape closes only the menu, not a dialog the menu may sit in.
      event.preventDefault();
      event.stopPropagation();
      props.dismiss();
    } else if (event.key === 'Tab') {
      // Focus moves on by itself; the menu just gets out of the way.
      props.close();
    }
  };

  return (
    <div
      ref={listRef}
      id={props.id}
      role="menu"
      aria-label={props.label}
      onKeyDown={handleKeyDown}
      className={props.className}
    >
      {props.children}
    </div>
  );
}

export interface MenuProps {
  /** Names the menu for assistive technology, for example "Workspaces". */
  label: string;
  /** What the button shows. */
  button: ReactNode;
  buttonClassName?: string;
  /** Which side of the button the menu opens on. Defaults to `bottom`. */
  side?: 'top' | 'bottom';
  /** Menu items: `MenuItem`, `MenuLink`, and `MenuSeparator`. */
  children: ReactNode;
}

/**
 * A button that opens a menu of actions or destinations. Arrow keys, Home,
 * and End move between items; Escape closes and returns focus to the button.
 */
export function Menu(props: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => setOpen(false);
  const dismiss = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  useCloseOnOutsidePress(rootRef, open, close);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={props.buttonClassName}
      >
        {props.button}
      </button>
      {open ? (
        <MenuCloseContext value={close}>
          <MenuList
            id={menuId}
            label={props.label}
            dismiss={dismiss}
            close={close}
            className={cx(
              'absolute inset-x-0 z-20 flex max-h-80 min-w-48 flex-col gap-0.5 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg',
              props.side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            {props.children}
          </MenuList>
        </MenuCloseContext>
      ) : null}
    </div>
  );
}

export interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
}

/** A menu entry that does something. */
export function MenuItem(props: MenuItemProps) {
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={ITEM_CLASSES}
      onClick={() => {
        close();
        props.onSelect();
      }}
    >
      {props.children}
    </button>
  );
}

export interface MenuLinkProps {
  to: To;
  /** Set on a list of choices to mark which one is current; leave unset otherwise. */
  selected?: boolean;
  children: ReactNode;
}

/** A menu entry that goes somewhere. */
export function MenuLink(props: MenuLinkProps) {
  const close = useContext(MenuCloseContext);
  const isChoice = props.selected !== undefined;
  return (
    <Link
      to={props.to}
      role={isChoice ? 'menuitemradio' : 'menuitem'}
      aria-checked={isChoice ? props.selected : undefined}
      tabIndex={-1}
      className={ITEM_CLASSES}
      onClick={close}
    >
      <span className="min-w-0 flex-1 truncate">{props.children}</span>
      {props.selected === true ? (
        <CheckIcon className="size-4 text-indigo-700" />
      ) : null}
    </Link>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-slate-200" />;
}
