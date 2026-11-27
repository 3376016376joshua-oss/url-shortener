/**
 * Navigation state for a link that changes part of a view rather than the
 * whole view, for example a tab. The layout moves focus to the top of the
 * page on every other navigation; with this state focus stays on the link.
 */
export const KEEP_FOCUS_STATE = { keepFocus: true } as const;

/** Whether a location's state asks the layout to leave focus where it is. */
export function keepsFocus(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'keepFocus' in state &&
    state.keepFocus === true
  );
}
