import { defineConfig } from '@playwright/test';

/** Self-contained browser evidence: SSR is rendered in-process, no Docker. */
export default defineConfig({
  testDir: './tests',
  testMatch: '11-public-bracket-geometry.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
