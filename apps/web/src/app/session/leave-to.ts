/**
 * Leaves the running dashboard for `path` with a full page load, which drops
 * everything held in memory. Used on sign-out, so nothing one user loaded can
 * be shown to the next.
 */
export function leaveTo(path: string): void {
  window.location.assign(path);
}
