import { expect, test } from '../support/test.js';
import { ACME } from './data.js';

test.describe('component kit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/w/${ACME}/kit`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Components' }),
    ).toBeVisible();
  });

  test('a confirmation opens on Cancel, holds focus, and returns it on Escape', async ({
    page,
  }) => {
    const opener = page.getByRole('button', { name: 'Delete link' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Delete this link?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(
      'The short link stops working at once. This cannot be undone.',
    );
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    const confirm = dialog.getByRole('button', { name: 'Delete link' });
    await expect(cancel).toBeFocused();

    // Focus cycles inside the dialog rather than reaching the page behind it.
    await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a press outside a dialog closes it', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete link' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this link?' });
    await expect(dialog).toBeVisible();

    await page.mouse.click(5, 5);

    await expect(dialog).toBeHidden();
  });

  test('a menu is driven by the arrow keys and closes on a press outside', async ({
    page,
  }) => {
    const button = page.getByRole('button', { name: 'More actions' });
    await button.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Link actions' });
    await expect(
      menu.getByRole('menuitem', { name: 'Duplicate' }),
    ).toBeFocused();

    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Disable' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      menu.getByRole('menuitem', { name: 'Duplicate' }),
    ).toBeFocused();
    await page.getByRole('heading', { level: 1, name: 'Components' }).click();

    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('a copy button puts the value on the clipboard and says so', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const copy = page.getByRole('button', { name: 'Copy TXT record value' });

    await copy.click();

    await expect(copy).toHaveText('Copied');
    await expect(page.getByText('Copied to clipboard')).toBeAttached();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'sv_4f9c',
    );
  });

  test('a toast announces itself and can be dismissed', async ({ page }) => {
    await page.getByRole('button', { name: 'Show toast' }).click();
    const notifications = page.getByRole('region', { name: 'Notifications' });
    await expect(notifications).toHaveAttribute('aria-live', 'polite');
    await expect(notifications).toContainText('Link saved');

    await notifications.getByRole('button', { name: 'Dismiss' }).click();

    await expect(notifications).not.toContainText('Link saved');
  });

  test('a field ties its hint and its error to the control', async ({
    page,
  }) => {
    const destination = page.getByRole('textbox', { name: 'Destination' });
    await expect(destination).toHaveAccessibleDescription(
      'Where the short link leads.',
    );
    const code = page.getByRole('textbox', { name: 'Custom code' });
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toHaveAccessibleDescription(
      'Use 3 to 32 letters, digits, hyphens, or underscores.',
    );
  });

  test('a busy button cannot be pressed again', async ({ page }) => {
    const saving = page.getByRole('button', { name: 'Saving' });

    await expect(saving).toBeDisabled();
    await expect(saving).toHaveAttribute('aria-busy', 'true');
  });
});
