import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Where the API listens when the dashboard runs on the Vite dev server. */
const DEV_API_ORIGIN = `http://localhost:${process.env.API_PORT ?? '3000'}`;

/** The mode the Playwright harness builds the dashboard in. */
const E2E_MODE = 'e2e';

/**
 * Features are discovered under `@features` (src/app/registry/discover.ts).
 * The shell's own end-to-end tests swap in fixture features, so they exercise
 * the real discovery without depending on any real feature.
 */
function featuresDirectory(mode: string): string {
  const directory =
    mode === E2E_MODE ? './e2e/fixtures/features' : './src/features';
  return fileURLToPath(new URL(directory, import.meta.url));
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@features': featuresDirectory(mode) },
  },
  server: {
    // Same-origin in development too, so the session cookie behaves as in production.
    proxy: { '/api': DEV_API_ORIGIN },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['src/app/testing/vitest-setup.ts'],
  },
}));
