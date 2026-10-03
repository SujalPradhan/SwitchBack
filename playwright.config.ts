import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Switchback.
 *
 * E2E tests run against the production build served locally.
 * The service worker only activates in production builds, so we cannot
 * use the Angular dev server for SW-related tests.
 *
 * Run the full suite:
 *   npx ng build && npx playwright test
 *
 * Chromium flags used:
 *   --disable-features=WebRtcHideLocalIpsWithMdns  — expose real IPs for loopback WebRTC
 *   --use-fake-device-for-media-stream              — fake camera (no physical camera needed)
 *   --use-fake-ui-for-media-stream                  — auto-grant camera permission
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // WebRTC tests share state — keep sequential
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],

  // Start the production build's static files before running tests.
  // Build must already be complete (npx ng build runs separately in CI).
  webServer: {
    command: 'npx http-server dist/switchback/browser -p 4201 --cors -c-1 -s --proxy http://localhost:4201?',
    url: 'http://localhost:4201',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
