const STORAGE_KEY = 'url-shortener:last-workspace';

/**
 * Remembers which workspace was open, so the dashboard reopens there. This
 * is a convenience: when the browser refuses storage (private browsing, a
 * full quota) the dashboard simply opens the first workspace instead.
 */
export function rememberWorkspace(workspaceId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, workspaceId);
  } catch {
    // See above: nothing depends on this having worked.
  }
}

export function recallWorkspace(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
