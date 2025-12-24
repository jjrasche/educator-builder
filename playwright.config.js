import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './testing',
  testMatch: '**/*.js',
  timeout: 600000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,  // Show browser window
    viewport: { width: 1280, height: 720 },
    video: 'on-first-retry',
  },
  reporter: [['list']],
});
