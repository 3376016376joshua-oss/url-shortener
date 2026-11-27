import { AxeBuilder } from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { MockApi } from './mock-api.js';

/** The conformance level the dashboard promises (PRD requirement DB-6). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface ShellFixtures {
  /** The API as this test wants it. Signed in as the default session to start. */
  api: MockApi;
  /** Whether this run is on the narrow viewport, where navigation is behind a button. */
  isNarrow: boolean;
}

export const test = base.extend<ShellFixtures>({
  api: [
    async ({ page }, use) => {
      const api = new MockApi(page);
      await api.start();
      await use(api);
      expect(api.unexpected, 'requests the test did not mock').toEqual([]);
    },
    { auto: true },
  ],
  isNarrow: async ({ viewport }, use) => {
    const MOBILE_BREAKPOINT = 768;
    await use(viewport !== null && viewport.width < MOBILE_BREAKPOINT);
  },
});

export { expect };

/** Fails on any WCAG 2.1 A or AA violation an automated check can find. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((violation) => ({
    rule: violation.id,
    help: violation.help,
    elements: violation.nodes.map((node) => node.target.join(' ')),
  }));
  expect(violations).toEqual([]);
}

/** Fails when the page is wider than the screen and scrolls sideways. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow, 'pixels the page overflows sideways').toBe(0);
}

/** Opens the navigation on a narrow screen, where it sits behind a button. */
export async function showNavigation(
  page: Page,
  isNarrow: boolean,
): Promise<void> {
  if (isNarrow) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
}
