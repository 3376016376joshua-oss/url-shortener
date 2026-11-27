import type { CSSProperties } from 'react';

/** The space between a menu and its button. */
const GAP_PX = 4;
/** The space a menu keeps from the top and bottom of the screen. */
const EDGE_MARGIN_PX = 8;
/** A longer menu scrolls inside itself. */
const MAX_HEIGHT_PX = 320;

export type MenuSide = 'top' | 'bottom';

export type AnchorRect = Pick<
  DOMRect,
  'top' | 'bottom' | 'left' | 'right' | 'width'
>;

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * The side the menu opens on: the preferred one, unless it is cramped and
 * the other side has more room.
 */
function chooseSide(
  room: Record<MenuSide, number>,
  preferred: MenuSide,
): MenuSide {
  const other = preferred === 'top' ? 'bottom' : 'top';
  const isRoomy =
    room[preferred] >= MAX_HEIGHT_PX || room[preferred] >= room[other];
  return isRoomy ? preferred : other;
}

/**
 * Where a menu goes, as `position: fixed` offsets from the edges of the
 * viewport. Fixed, so a menu opened inside a scrolling frame, such as a
 * table, is not clipped by it; and always wholly on screen, because a fixed
 * element that runs off the screen cannot be scrolled to.
 *
 * Sideways, the menu lines up with the edge of its button that is further
 * from the edge of the screen, so it opens towards the room there is.
 */
export function placeMenu(
  anchor: AnchorRect,
  viewport: ViewportSize,
  preferredSide: MenuSide,
): CSSProperties {
  const room = {
    top: anchor.top - GAP_PX - EDGE_MARGIN_PX,
    bottom: viewport.height - anchor.bottom - GAP_PX - EDGE_MARGIN_PX,
  };
  const side = chooseSide(room, preferredSide);
  const vertical =
    side === 'top'
      ? { bottom: viewport.height - anchor.top + GAP_PX }
      : { top: anchor.bottom + GAP_PX };
  const anchorCentre = anchor.left + anchor.width / 2;
  const horizontal =
    anchorCentre > viewport.width / 2
      ? { right: viewport.width - anchor.right }
      : { left: anchor.left };
  return {
    ...horizontal,
    ...vertical,
    minWidth: anchor.width,
    maxHeight: Math.min(MAX_HEIGHT_PX, room[side]),
  };
}
