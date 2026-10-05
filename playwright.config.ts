import { defineConfig } from '@playwright/test';
process.loadEnvFile?.('.env');
export default defineConfig({
  timeout: 120000,
  expect: { timeout: 30000 },
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: {
    command: process.env.E2E_PRODUCTION
      ? 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100'
      : 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
