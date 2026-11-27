import { apiError, DEFAULT_SESSION, json } from '../support/mock-api.js';
import { expect, showNavigation, test } from '../support/test.js';
import { ACME, GLOBEX, mockLinks } from './data.js';

test.describe('session', () => {
  test('a signed-out visitor is sent to sign in and remembers where they were going', async ({
    page,
    api,
  }) => {
    api.signedOut();

    await page.goto(`/w/${ACME}/links?status=ACTIVE`);

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe('/sign-in');
    expect(url.searchParams.get('next')).toBe(`/w/${ACME}/links?status=ACTIVE`);
  });

  test('the dashboard opens on the first section of the first workspace', async ({
    page,
    api,
  }) => {
    mockLinks(api, ACME);

    await page.goto('/');

    await expect(page).toHaveURL(`/w/${ACME}/links`);
    await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();
    await expect(page).toHaveTitle('Links - URL Shortener');
  });

  test('the dashboard reopens the workspace used last', async ({
    page,
    api,
  }) => {
    mockLinks(api, GLOBEX);
    await page.goto(`/w/${GLOBEX}/links`);
    await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();

    await page.goto('/');

    await expect(page).toHaveURL(`/w/${GLOBEX}/links`);
  });

  test('a user without a workspace is sent to create one', async ({
    page,
    api,
  }) => {
    api.signedIn({ ...DEFAULT_SESSION, workspaces: [] });

    await page.goto('/');

    await expect(page).toHaveURL('/workspaces/new');
    await expect(
      page.getByRole('heading', { name: 'Create a workspace' }),
    ).toBeVisible();
  });

  test('a session that ends mid-visit sends the visitor to sign in', async ({
    page,
    api,
  }) => {
    api.on(`GET /workspaces/${ACME}/links`, () =>
      apiError(401, 'UNAUTHENTICATED', 'Sign in to continue'),
    );

    await page.goto(`/w/${ACME}/links`);

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('next')).toBe(
      `/w/${ACME}/links`,
    );
  });

  test('an outage while loading the session offers a retry that recovers', async ({
    page,
    api,
  }) => {
    mockLinks(api, ACME);
    api.on('GET /me', () =>
      apiError(503, 'SERVICE_UNAVAILABLE', 'The service is unavailable'),
    );
    await page.goto(`/w/${ACME}/links`);
    await expect(page.getByRole('status')).toHaveText('Loading your account');
    // The session is retried with a backoff before the failure is shown.
    await expect(page.getByRole('alert')).toContainText(
      'Your account could not be loaded',
      { timeout: 15_000 },
    );
    await expect(page.getByRole('alert')).toContainText('req-mock-1');

    api.signedIn();
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();
  });

  test('signing out revokes the session and leaves for the sign-in page', async ({
    page,
    api,
    isNarrow,
  }) => {
    mockLinks(api, ACME);
    api.on('POST /auth/sign-out', () => ({ status: 204 }));
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);
    await page.getByRole('button', { name: /^Account: Ada Lovelace/ }).click();
    await page.getByRole('menuitem', { name: 'Profile' }).waitFor();

    api.signedOut();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveURL('/sign-in');
    expect(api.requests).toContain('POST /auth/sign-out');
  });

  test('a failed sign-out says so and keeps the visitor signed in', async ({
    page,
    api,
    isNarrow,
  }) => {
    mockLinks(api, ACME);
    api.on('POST /auth/sign-out', () =>
      json({ unexpected: 'not the error body' }, 500),
    );
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);
    await page.getByRole('button', { name: /^Account: Ada Lovelace/ }).click();

    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(
      page.getByRole('region', { name: 'Notifications' }),
    ).toContainText('Could not sign out.');
    await expect(page).toHaveURL(`/w/${ACME}/links`);
  });
});
