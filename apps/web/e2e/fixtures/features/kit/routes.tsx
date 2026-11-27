import type { FeatureRoutes } from '../../../../src/app/shell.js';
import { KitGallery } from './KitGallery.js';

/** A second fixture feature: every component of the kit on one page. */
export const routes: FeatureRoutes = {
  workspace: [{ path: 'kit', Component: KitGallery }],
  workspaceNav: [{ label: 'Components', to: 'kit', order: 20 }],
};
