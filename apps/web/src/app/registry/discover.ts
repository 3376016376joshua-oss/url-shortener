import { collectRegistry, type Registry } from './collect.js';

/**
 * Finds every feature's contribution at build time. `@features` is
 * `src/features` (see vite.config.ts), so a feature joins the dashboard by
 * adding `src/features/<feature>/routes.tsx` or `link-tabs.tsx`, and no
 * shared file is ever edited.
 */
export function discoverRegistry(): Registry {
  return collectRegistry(
    import.meta.glob('@features/*/routes.tsx', { eager: true }),
    import.meta.glob('@features/*/link-tabs.tsx', { eager: true }),
  );
}
