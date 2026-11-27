import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, type To } from 'react-router';
import { CheckIcon } from './icons.js';
import { placeMenu, type MenuSide } from './menu-placement.js';

const ITEM_SELECTOR = '[role^="menuitem"]';

const LIST_CLASSES =
  'fixed z-20 flex w-max max-w-[min(20rem,calc(100vw-1rem))] flex-col gap-0.5 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg';

const ITEM_CLASSES =
  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 focus-visible:bg-slate-100';

interface MenuControls {
  /** Closes the menu and leaves focus to whatever happens next. */
  close: () => void;
  /** Closes the menu and puts focus back on its button. */
  dismiss: () => void;
}

const MenuContext = createContext<MenuControls>({
  close: () => undefined,
  dismiss: () => undefined,
});

function focusItem(
  list: HTMLElement,
  pick: (count: number, at: number) => number,
) {
  const items = Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
  const current = items.findIndex((item) => item === document.activeElement);
  items[pick(items.length, current)]?.focus();
}

/**
 * While a menu is open: a press outside closes it, and the page scrolling
 * or resizing under it moves it along with its button. Following the button
 * rather than closing matters because scrolling is not always the person's
 * doing: focusing a control can scroll the page, and a flick keeps going.
 */
function useFollowButton(
  rootRef: RefObject<HTMLElement | null>,
  open: boolean,
  controls: Pick<MenuControls, 'close'> & { place: () => void },
) {
  const { close, place } = controls;
  useEffect(() => {
    if (!open) {
      return;
    }
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target;
      const isInside =
        target instanceof Node && rootRef.current?.contains(target) === true;
      if (!isInside) {
        close();
      }
    };
    document.addEventListener('pointerdown', closeIfOutside);
    // Captured, because scroll events do not bubble out of a scrolling frame.
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [rootRef, open, close, place]);
}

interface MenuListProps {
  id: string;
  label: string;
  style: CSSProperties;
  children: ReactNode;
}

function MenuList(props: MenuListProps) {
  const { close, dismiss } = useContext(MenuContext);
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
      dismiss();
    } else if (event.key === 'Tab') {
      // Focus moves on by itself; the menu just gets out of the way.
      close();
    }
  };

  return (
    <div
      ref={listRef}
      id={props.id}
      role="menu"
      aria-label={props.label}
      onKeyDown={handleKeyDown}
      style={props.style}
      className={LIST_CLASSES}
    >
      {props.children}
    </div>
  );
}

/** The open-or-closed state of one menu, and where it sits while open. */
function useMenuState(side: MenuSide) {
  // `null` while the menu is closed.
  const [placement, setPlacement] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = placement !== null;
  const [controls] = useState<MenuControls>(() => ({
    close: () => setPlacement(null),
    dismiss: () => {
      setPlacement(null);
      buttonRef.current?.focus();
    },
  }));
  const place = useCallback(() => {
    const button = buttonRef.current;
    if (button !== null) {
      const viewport = document.documentElement;
      setPlacement(
        placeMenu(
          button.getBoundingClientRect(),
          { width: viewport.clientWidth, height: viewport.clientHeight },
          side,
        ),
      );
    }
  }, [side]);
  useFollowButton(rootRef, open, { close: controls.close, place });

  return {
    rootRef,
    buttonRef,
    placement,
    controls,
    toggle: open ? controls.close : place,
  };
}

export interface MenuProps {
  /** Names the menu for assistive technology, for example "Workspaces". */
  label: string;
  /** What the button shows. */
  button: ReactNode;
  buttonClassName?: string;
  /** Which side of the button the menu opens on. Defaults to `bottom`. */
  side?: MenuSide;
  /** Menu items: `MenuItem`, `MenuLink`, and `MenuSeparator`. */
  children: ReactNode;
}

/**
 * A button that opens a menu of actions or destinations. Arrow keys, Home,
 * and End move between items; Escape closes and returns focus to the button.
 */
export function Menu(props: MenuProps) {
  const menuId = useId();
  const { rootRef, buttonRef, placement, controls, toggle } = useMenuState(
    props.side ?? 'bottom',
  );
  const open = placement !== null;

  return (
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        className={props.buttonClassName}
      >
        {props.button}
      </button>
      {open ? (
        <MenuContext value={controls}>
          <MenuList id={menuId} label={props.label} style={placement}>
            {props.children}
          </MenuList>
        </MenuContext>
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
  const { dismiss } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={ITEM_CLASSES}
      onClick={() => {
        // Focus returns to the button first, so a dialog the action opens
        // has somewhere to give focus back to when it closes.
        dismiss();
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
  const { close } = useContext(MenuContext);
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
