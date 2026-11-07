import { defineConfig } from '@playwright/test';

const port = Number(process.env.FILLIN_E2E_PORT || 4177);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  globalTimeout: 5 * 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: 'node e2e/server.mjs',
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
  },
});
