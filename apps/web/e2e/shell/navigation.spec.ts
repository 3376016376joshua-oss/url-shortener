import { expect, showNavigation, test } from '../support/test.js';
import { ACME, GLOBEX, mockLinks } from './data.js';

test.describe('navigation', () => {
  test.beforeEach(({ api }) => {
    mockLinks(api, ACME);
    mockLinks(api, GLOBEX);
  });

  test('the sidebar lists the sections of every feature, in order, and marks the open one', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);

    const nav = page.getByRole('navigation', { name: 'Workspace' });
    await expect(nav.getByRole('link')).toHaveText([
      'Links',
      'Components',
      'Members',
    ]);
    await expect(nav.getByRole('link', { name: 'Links' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      nav.getByRole('link', { name: 'Components' }),
    ).not.toHaveAttribute('aria-current');
  });

  test('following a section moves focus to the new page', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);

    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('link', { name: 'Components' })
      .click();

    await expect(page).toHaveURL(`/w/${ACME}/kit`);
    await expect(page).toHaveTitle('Components - URL Shortener');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('a section above the member role is hidden from a member', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${GLOBEX}/links`);
    await showNavigation(page, isNarrow);

    const nav = page.getByRole('navigation', { name: 'Workspace' });
    await expect(nav.getByRole('link')).toHaveText(['Links', 'Components']);
  });

  test('the workspace switcher changes workspace by keyboard alone', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);
    const switcher = page.getByRole('button', { name: 'Workspace: Acme' });

    await switcher.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Workspaces' });
    await expect(
      menu.getByRole('menuitemradio', { name: 'Acme' }),
    ).toBeFocused();
    await expect(
      menu.getByRole('menuitemradio', { name: 'Acme' }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(
      menu.getByRole('menuitemradio', { name: 'Globex' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(`/w/${GLOBEX}/links`);
    await showNavigation(page, isNarrow);
    await expect(
      page.getByRole('button', { name: 'Workspace: Globex' }),
    ).toBeVisible();
  });

  test('Escape closes a menu and returns focus to its button', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);
    const switcher = page.getByRole('button', { name: 'Workspace: Acme' });
    await switcher.click();
    await expect(page.getByRole('menu', { name: 'Workspaces' })).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(switcher).toBeFocused();
    await expect(switcher).toHaveAttribute('aria-expanded', 'false');
  });

  test('the switcher leads to creating a workspace', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${ACME}/links`);
    await showNavigation(page, isNarrow);
    await page.getByRole('button', { name: 'Workspace: Acme' }).click();

    await page.getByRole('menuitem', { name: 'Create workspace' }).click();

    await expect(page).toHaveURL('/workspaces/new');
    await expect(
      page.getByRole('heading', { name: 'Create a workspace' }),
    ).toBeVisible();
  });

  test('the skip link jumps past the navigation to the page', async ({
    page,
  }) => {
    await page.goto(`/w/${ACME}/links`);
    await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('main')).toBeFocused();
  });

  test('the navigation panel on a narrow screen opens, traps focus, and closes', async ({
    page,
    isNarrow,
  }) => {
    test.skip(!isNarrow, 'The panel exists only on a narrow screen');
    await page.goto(`/w/${ACME}/links`);
    const opener = page.getByRole('button', { name: 'Open navigation' });
    await expect(
      page.getByRole('navigation', { name: 'Workspace' }),
    ).toHaveCount(0);

    await opener.click();
    const panel = page.getByRole('dialog', { name: 'Navigation' });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('navigation', { name: 'Workspace' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await panel.getByRole('link', { name: 'Components' }).click();

    await expect(page).toHaveURL(`/w/${ACME}/kit`);
    await expect(panel).toBeHidden();
  });

  test('the navigation panel gets out of the way when the screen grows wide', async ({
    page,
    isNarrow,
  }) => {
    test.skip(!isNarrow, 'The panel exists only on a narrow screen');
    await page.goto(`/w/${ACME}/links`);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Navigation' }),
    ).toBeVisible();

    // As when a tablet is turned on its side.
    await page.setViewportSize({ width: 1024, height: 768 });

    // The sidebar takes over, and the page behind the panel is usable again.
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('link', { name: 'Components' })
      .click();
    await expect(page).toHaveURL(`/w/${ACME}/kit`);
  });

  test('an address that matches nothing in a workspace says so, inside the layout', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${ACME}/no-such-section`);

    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    await showNavigation(page, isNarrow);
    await expect(
      page.getByRole('navigation', { name: 'Workspace' }),
    ).toBeVisible();
  });

  test('a workspace the user is not in looks like one that does not exist', async ({
    page,
  }) => {
    await page.goto('/w/ws-someone-elses/links');

    await expect(
      page.getByRole('heading', { name: 'Workspace not found' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Go to the dashboard' }).click();
    await expect(page).toHaveURL(`/w/${ACME}/links`);
  });

  test('an address outside every area is a plain not-found page', async ({
    page,
  }) => {
    await page.goto('/no/such/page');

    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Page not found - URL Shortener');
  });

  test('a page that fails to render leaves the rest of the dashboard usable', async ({
    page,
    isNarrow,
  }) => {
    await page.goto(`/w/${ACME}/broken`);

    await expect(page.getByRole('alert')).toContainText(
      'This page ran into a problem',
    );
    await showNavigation(page, isNarrow);
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('link', { name: 'Links' })
      .click();
    await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();
  });
});
