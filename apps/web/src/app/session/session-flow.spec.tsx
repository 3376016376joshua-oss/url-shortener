import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { sessionQueryKey, useApiClient } from '../../api/index.js';
import {
  emptyResponse,
  errorResponse,
  jsonResponse,
} from '../../api/testing/fake-fetch.js';
import { PageHeader, QueryView } from '../../ui/index.js';
import { resolveNextPath, useWorkspace, type FeatureRoutes } from '../shell.js';
import { renderApp, TEST_SESSION } from '../testing/render-app.js';
import { leaveTo } from './leave-to.js';

vi.mock('./leave-to.js', () => ({ leaveTo: vi.fn() }));

/** Signs in the way the README tells the auth feature to. */
function SignInPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const finishSignIn = async () => {
    await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    await navigate(resolveNextPath(location.search));
  };
  return (
    <>
      <PageHeader title="Sign in" />
      <button type="button" onClick={() => void finishSignIn()}>
        Continue
      </button>
    </>
  );
}

function LinksPage() {
  const api = useApiClient();
  const workspace = useWorkspace();
  const query = useQuery({
    queryKey: ['workspaces', workspace.id, 'links'],
    queryFn: () =>
      api.request('GET', `/workspaces/${workspace.id}/links`, {
        schema: z.object({ owner: z.string() }),
      }),
  });
  return (
    <>
      <PageHeader title={`Links of ${workspace.name}`} />
      <QueryView query={query}>
        {(data) => <p>{`Loaded for ${data.owner}`}</p>}
      </QueryView>
    </>
  );
}

const FEATURE: FeatureRoutes = {
  public: [{ path: 'sign-in', Component: SignInPage }],
  workspace: [{ path: 'links', Component: LinksPage }],
};

const UNAUTHENTICATED = () =>
  errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue');
const LINKS = 'GET /workspaces/ws-1/links';

function heading(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Account:\s*Ada/ }));
}

describe('the session', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(leaveTo).mockClear();
  });
  afterEach(cleanup);

  it('sends a signed-out visitor to sign in, remembering the address', async () => {
    const { router } = renderApp({
      path: '/w/ws-1/links?status=ACTIVE',
      features: [FEATURE],
      session: null,
    });

    await heading('Sign in');
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toBe(
      '?next=%2Fw%2Fws-1%2Flinks%3Fstatus%3DACTIVE',
    );
  });

  it('opens the page the visitor was going to once they have signed in', async () => {
    let signedIn = false;
    const { router } = renderApp({
      path: '/w/ws-1/links',
      features: [FEATURE],
      handlers: {
        'GET /me': () =>
          signedIn ? jsonResponse(TEST_SESSION) : UNAUTHENTICATED(),
        [LINKS]: () => jsonResponse({ owner: 'Ada' }),
      },
    });
    await heading('Sign in');

    signedIn = true;
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Loaded for Ada')).toBeDefined();
    expect(router.state.location.pathname).toBe('/w/ws-1/links');
  });

  it('ends the session when any request answers 401', async () => {
    const { router } = renderApp({
      path: '/w/ws-1/links',
      features: [FEATURE],
      handlers: { [LINKS]: UNAUTHENTICATED },
    });

    await heading('Sign in');
    expect(router.state.location.search).toBe('?next=%2Fw%2Fws-1%2Flinks');
  });

  it('signs out through the API, then leaves for the sign-in page', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp({
      path: '/w/ws-1/links',
      features: [FEATURE],
      handlers: {
        [LINKS]: () => jsonResponse({ owner: 'Ada' }),
        'POST /auth/sign-out': () => emptyResponse(),
      },
    });
    await heading('Links of Acme');

    await openAccountMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith('/sign-in'));
    expect(
      requests.map((request) => `${request.method} ${request.path}`),
    ).toContain('POST /auth/sign-out');
  });

  it('stays signed in, and says why, when signing out fails', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/w/ws-1/links',
      features: [FEATURE],
      handlers: {
        [LINKS]: () => jsonResponse({ owner: 'Ada' }),
        'POST /auth/sign-out': () =>
          errorResponse(503, 'SERVICE_UNAVAILABLE', 'Down'),
      },
    });
    await heading('Links of Acme');

    await openAccountMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    const notifications = screen.getByRole('region', { name: 'Notifications' });
    await waitFor(() =>
      expect(notifications.textContent).toContain('Could not sign out.'),
    );
    expect(leaveTo).not.toHaveBeenCalled();
  });
});
