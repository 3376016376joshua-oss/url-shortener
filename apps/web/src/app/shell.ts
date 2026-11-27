/**
 * What the shell offers to features. A feature imports from here, from
 * `ui`, and from `api`, and from nowhere else in `app`.
 */
export {
  useLinkParams,
  type LinkParams,
} from './link-detail/use-link-params.js';
export { paths, resolveNextPath, signInPath } from './paths.js';
export type { FeatureRoutes, NavItem } from './registry/feature-routes.js';
export type { LinkTab, LinkTabsModule } from './registry/link-tabs.js';
export { useSession } from './session/session-context.js';
export { roleAtLeast } from './workspace/roles.js';
export { useWorkspace } from './workspace/workspace-context.js';
