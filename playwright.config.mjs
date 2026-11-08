import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  outputDir: 'test-results',
  timeout: 30000,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5207',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'firefox-desktop', use: { browserName: 'firefox', viewport: { width: 1280, height: 800 } } },
    { name: 'chromium-phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'chromium-short', use: { browserName: 'chromium', viewport: { width: 800, height: 400 } } },
  ],
  webServer: {
    command: 'npm run serve -- --host 127.0.0.1 --port 5207 --strictPort',
    url: 'http://127.0.0.1:5207',
    reuseExistingServer: false,
  },
});
