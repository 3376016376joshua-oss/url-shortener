import { expect, test } from '../support/test.js';
import { ACME, mockLinks } from './data.js';

const LINK = `/w/${ACME}/links/link-1`;

test.describe('link detail frame', () => {
  test('a link opens on its first tab, under the heading its feature provides', async ({
    page,
    api,
  }) => {
    mockLinks(api, ACME);
    await page.goto(`/w/${ACME}/links`);

    await page.getByRole('link', { name: 'Spring launch' }).click();

    await expect(page).toHaveURL(`${LINK}/analytics`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Link link-1' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Analytics' }),
    ).toBeVisible();
  });

  test('tabs come from the features, ordered, with the open one marked', async ({
    page,
  }) => {
    await page.goto(LINK);

    const tabs = page.getByRole('navigation', { name: 'Link sections' });
    await expect(tabs.getByRole('link')).toHaveText(['Analytics', 'QR code']);
    await expect(tabs.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('switching tab by keyboard shows the tab and keeps focus on it', async ({
    page,
  }) => {
    await page.goto(`${LINK}/analytics`);
    const qrTab = page
      .getByRole('navigation', { name: 'Link sections' })
      .getByRole('link', { name: 'QR code' });

    await qrTab.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(`${LINK}/qr-code`);
    await expect(page.getByText('The QR code of link link-1.')).toBeVisible();
    await expect(qrTab).toHaveAttribute('aria-current', 'page');
    await expect(qrTab).toBeFocused();
  });

  test('the frame leads back to the link list', async ({ page, api }) => {
    mockLinks(api, ACME);
    await page.goto(`${LINK}/qr-code`);

    await page
      .getByRole('main')
      .getByRole('link', { name: 'Links', exact: true })
      .click();

    await expect(page).toHaveURL(`/w/${ACME}/links`);
    await expect(page.getByRole('table', { name: 'Links' })).toBeVisible();
  });

  test('a tab that does not exist is not found, with the frame still around it', async ({
    page,
  }) => {
    await page.goto(`${LINK}/no-such-tab`);

    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Link sections' }),
    ).toBeVisible();
  });
});
