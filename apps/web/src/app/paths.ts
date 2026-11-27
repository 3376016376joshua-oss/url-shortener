/**
 * The addresses the shell itself depends on. The features that serve the
 * first three register their routes at exactly these paths.
 */
export const paths = {
  home: '/',
  /** Where a signed-out visitor is sent. Served by the auth feature. */
  signIn: '/sign-in',
  /** Linked from the workspace switcher. Served by the workspace feature. */
  createWorkspace: '/workspaces/new',
  /** The link list, which the link detail frame leads back to. */
  links: (workspaceId: string) => `${paths.workspace(workspaceId)}/links`,
  workspace: (workspaceId: string) => `/w/${encodeURIComponent(workspaceId)}`,
  link: (workspaceId: string, linkId: string) =>
    `${paths.links(workspaceId)}/${encodeURIComponent(linkId)}`,
} as const;

/** The route pattern every workspace page lives under. */
export const WORKSPACE_ROUTE = 'w/:workspaceId';

/** The search parameter that carries where to go after signing in. */
const NEXT_PARAM = 'next';

/** The sign-in address that returns to `next`, a path on this site, afterwards. */
export function signInPath(next: string): string {
  if (next === paths.home) {
    return paths.signIn;
  }
  const search = new URLSearchParams({ [NEXT_PARAM]: next });
  return `${paths.signIn}?${search.toString()}`;
}

/**
 * Where to go after signing in, read from the sign-in page's query string.
 * Anything that is not a plain path on this site is ignored, so a crafted
 * link cannot use sign-in to send someone to another site.
 */
export function resolveNextPath(search: string): string {
  const next = new URLSearchParams(search).get(NEXT_PARAM);
  const isLocalPath =
    next !== null && /^\/(?![/\\])/.test(next) && !/[\r\n\t]/.test(next);
  return isLocalPath ? next : paths.home;
}
