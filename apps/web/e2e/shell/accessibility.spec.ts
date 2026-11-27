import type { Page, TestInfo } from '@playwright/test';
import { apiError, type MockApi } from '../support/mock-api.js';
import {
  expect,
  expectAccessible,
  expectNoSidewaysScroll,
  showNavigation,
  test,
} from '../support/test.js';
import { ACME, mockLinks } from './data.js';

interface View {
  name: string;
  path: string;
  /** What the API answers for this view. */
  arrange?: (api: MockApi) => void;
  /** Visible once the view has settled. */
  settled: (page: Page) => ReturnType<Page['getByRole']>;
}

const heading = (name: string) => (page: Page) =>
  page.getByRole('heading', { level: 1, name });

/** Every view the shell renders, and each state a view can be in. */
const VIEWS: View[] = [
  {
    name: 'signed-out page',
    path: '/sign-in',
    arrange: (api) => api.signedOut(),
    settled: heading('Sign in'),
  },
  {
    name: 'page with a loaded table',
    path: `/w/${ACME}/links`,
    arrange: (api) => mockLinks(api, ACME),
    settled: (page) => page.getByRole('table', { name: 'Links' }),
  },
  {
    name: 'page in its empty state',
    path: `/w/${ACME}/links`,
    arrange: (api) => mockLinks(api, ACME, []),
    settled: (page) => page.getByText('No links yet'),
  },
  {
    name: 'page in its error state',
    path: `/w/${ACME}/links`,
    arrange: (api) =>
      api.on(`GET /workspaces/${ACME}/links`, () =>
        apiError(422, 'QUOTA_EXCEEDED', 'The workspace is over its quota'),
      ),
    settled: (page) => page.getByRole('alert'),
  },
  {
    name: 'component kit',
    path: `/w/${ACME}/kit`,
    settled: heading('Components'),
  },
  {
    name: 'link detail frame',
    path: `/w/${ACME}/links/link-1/analytics`,
    settled: heading('Link link-1'),
  },
  {
    name: 'account page',
    path: '/account/profile',
    settled: heading('Profile'),
  },
  {
    name: 'not found inside the layout',
    path: `/w/${ACME}/no-such-section`,
    settled: heading('Page not found'),
  },
  {
    name: 'not found outside the layout',
    path: '/no/such/page',
    settled: heading('Page not found'),
  },
  {
    name: 'page that failed to render',
    path: `/w/${ACME}/broken`,
    settled: (page) => page.getByRole('alert'),
  },
];

/** Checks the page as it stands, and keeps a picture of it in the report. */
async function expectUsable(page: Page, testInfo: TestInfo): Promise<void> {
  const name = testInfo.title.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase();
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach('view', { path, contentType: 'image/png' });
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
}

test.describe('accessibility and layout (DB-6)', () => {
  for (const view of VIEWS) {
    test(`the ${view.name} is accessible and fits the screen`, async ({
      page,
      api,
    }, testInfo) => {
      view.arrange?.(api);

      await page.goto(view.path);
      await expect(view.settled(page)).toBeVisible();

      await expectUsable(page, testInfo);
    });
  }

  test('the open navigation is accessible and fits the screen', async ({
    page,
    api,
    isNarrow,
  }, testInfo) => {
    mockLinks(api, ACME);
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);
    await page.getByRole('button', { name: 'Workspace: Acme' }).click();
    await expect(page.getByRole('menu', { name: 'Workspaces' })).toBeVisible();

    await expectUsable(page, testInfo);
  });

  test('the open account menu is accessible and fits the screen', async ({
    page,
    api,
    isNarrow,
  }, testInfo) => {
    mockLinks(api, ACME);
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);
    await page.getByRole('button', { name: /^Account: Ada Lovelace/ }).click();
    await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible();

    await expectUsable(page, testInfo);
  });

  test('an open dialog and a toast are accessible and fit the screen', async ({
    page,
  }, testInfo) => {
    await page.goto(`/w/${ACME}/kit`);
    await page.getByRole('button', { name: 'Show toast' }).click();
    await expect(
      page.getByRole('region', { name: 'Notifications' }),
    ).toContainText('Link saved');
    await page.getByRole('button', { name: 'Delete link' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Delete this link?' }),
    ).toBeVisible();

    await expectUsable(page, testInfo);
  });
});
