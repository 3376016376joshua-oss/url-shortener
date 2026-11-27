import { defineConfig, devices } from '@playwright/test';

/** Move it when the default is taken: `E2E_PORT=4174 pnpm test:e2e`. */
const PORT = Number(process.env.E2E_PORT ?? '4173');
const BASE_URL = `http://localhost:${String(PORT)}`;

/** Everything a run writes. `dist` is ignored by git, Prettier, and ESLint. */
const OUTPUT_DIR = 'e2e/dist';
const BUILD_DIR = `${OUTPUT_DIR}/app`;

/** The narrowest screen the dashboard supports (PRD requirement DB-6). */
const NARROW_VIEWPORT = { width: 360, height: 740 };

const IS_CI = process.env.CI !== undefined;

/**
 * The dashboard's browser tests. Every spec runs twice, on a desktop
 * viewport and on the narrowest supported one.
 *
 * The specs in `e2e/shell` test the shell by itself: the production build of
 * the dashboard with the fixture features of `e2e/fixtures/features` in
 * place of the real ones (the `e2e` mode in vite.config.ts), and the API
 * answered by each test (`e2e/support/test.ts`).
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: `${OUTPUT_DIR}/test-results`,
  fullyParallel: true,
  forbidOnly: IS_CI,
  // A test that passes on a second try is a flaky test, and should fail.
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${OUTPUT_DIR}/report`, open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: NARROW_VIEWPORT },
    },
  ],
  webServer: {
    command: [
      `pnpm exec vite build --mode e2e --outDir ${BUILD_DIR}`,
      `pnpm exec vite preview --outDir ${BUILD_DIR} --port ${String(PORT)} --strictPort`,
    ].join(' && '),
    url: BASE_URL,
    // Always a fresh build, so a run never tests yesterday's code.
    reuseExistingServer: false,
  },
});
