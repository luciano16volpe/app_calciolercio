import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    // schermo piccolo: niente deve uscire in orizzontale a 360 px
    { name: 'piccolo-360', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } } },
  ],
});
