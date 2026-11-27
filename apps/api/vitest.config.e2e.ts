import { defineConfig } from 'vitest/config';
import { testEnv } from './test/support/test-env.js';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    env: testEnv,
    // Every spec file shares one Postgres database and one Redis database.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
