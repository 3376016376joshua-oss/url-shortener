import type { FeatureRoutes } from '../../../../src/app/shell.js';
import {
  BrokenPage,
  CreateWorkspacePage,
  LinksPage,
  MembersPage,
  ProfilePage,
  SignInPage,
} from './pages.js';

/**
 * A stand-in for the real features: one page in each area the shell offers,
 * at the addresses the shell itself links to.
 */
export const routes: FeatureRoutes = {
  public: [{ path: 'sign-in', Component: SignInPage }],
  account: [
    { path: 'account/profile', Component: ProfilePage },
    { path: 'workspaces/new', Component: CreateWorkspacePage },
  ],
  workspace: [
    { path: 'links', Component: LinksPage },
    { path: 'members', Component: MembersPage },
    { path: 'broken', Component: BrokenPage },
  ],
  accountNav: [{ label: 'Profile', to: '/account/profile', order: 10 }],
  workspaceNav: [
    { label: 'Links', to: 'links', order: 10 },
    { label: 'Members', to: 'members', order: 30, minRole: 'admin' },
  ],
};
