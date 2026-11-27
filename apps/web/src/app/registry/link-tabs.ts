import type { ComponentType } from 'react';

/**
 * A tab of the link detail frame. Its component reads which link it is for
 * with `useLinkParams()`.
 */
export interface LinkTab {
  /** The tab's URL segment: lowercase letters, digits, and hyphens. */
  id: string;
  label: string;
  /** Lower comes first; the lowest is the tab a link opens on. */
  order: number;
  Component: ComponentType;
}

/**
 * What `src/features/<feature>/link-tabs.tsx` may export. A feature appears
 * in the link detail frame by adding that file.
 */
export interface LinkTabsModule {
  linkTabs?: LinkTab[];
  /**
   * Replaces the frame's plain heading with the link's own: its title, its
   * short URL, its actions. At most one feature provides it.
   */
  LinkHeader?: ComponentType;
}
