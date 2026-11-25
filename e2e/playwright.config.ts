import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
const API_PORT = 4100;
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  'postgres://sportgather:sportgather@localhost:55432/sportgather';
const appUrl = new URL(ADMIN_URL);
appUrl.username = 'sg_app';
appUrl.password = 'sg_app_e2e';
appUrl.pathname = '/sportgather_e2e';

export const API_BASE = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: './tests',
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1015 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // API memakai database e2e terpisah dan provider mock (OTP dibaca dari /v1/dev/outbox).
      command: 'node e2e/scripts/prepare-db.mjs && node apps/api/dist/main.js',
      url: `${API_BASE}/health`,
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'development',
        API_PORT: String(API_PORT),
        DATABASE_URL: appUrl.toString(),
        DATABASE_ADMIN_URL: ADMIN_URL,
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        // CI tidak punya S3; dokumen e2e disimpan di memori proses API.
        STORAGE_PROVIDER: 'memory',
      },
    },
    {
      command: `pnpm --filter @sportgather/web exec next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/masuk`,
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      env: { API_URL: API_BASE },
    },
  ],
});
