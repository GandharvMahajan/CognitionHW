import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 3100);
const apiPort = Number(process.env.E2E_API_PORT ?? 4100);
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/fintech_e2e?schema=public';

const serverEnv = {
  DATABASE_URL: databaseUrl,
  JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
  NODE_ENV: 'development',
  CORS_ORIGIN: `http://localhost:${webPort}`,
  // Specs sign in as many different roles in quick succession.
  LOGIN_RATE_LIMIT_PER_MINUTE: '500',
};

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @fintech/api start',
      cwd: '../..',
      port: apiPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...serverEnv, API_PORT: String(apiPort) },
    },
    {
      command: 'pnpm --filter @fintech/web build && pnpm --filter @fintech/web start',
      cwd: '../..',
      port: webPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...serverEnv,
        // `next build` must not run with NODE_ENV=development or it mixes dev and prod runtimes.
        NODE_ENV: 'production',
        WEB_PORT: String(webPort),
        API_INTERNAL_URL: `http://localhost:${apiPort}`,
        NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
      },
    },
  ],
});
