import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4322', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'webkit',
      // Concurrent Windows WebKit contexts can stall while loading the PDF-heavy demo.
      workers: process.platform === 'win32' ? 1 : undefined,
      use: { browserName: 'webkit' },
    },
  ],
  webServer: {
    command:
      '"' +
      process.execPath +
      '" node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4322 --ignore-lock',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
