import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Where the API listens when the dashboard runs on the Vite dev server. */
const DEV_API_ORIGIN = `http://localhost:${process.env.API_PORT ?? '3000'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin in development too, so the session cookie behaves as in production.
    proxy: { '/api': DEV_API_ORIGIN },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
