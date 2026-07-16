import { defineConfig } from '@playwright/test'

/**
 * INTENT: Playwright E2E config for the Electron desktop app.
 * CONSTRAINT: Tests run against the built app (out/main/index.js), not the dev
 *             server, because Playwright's Electron support launches a packaged
 *             binary. CI must run `npm run build` before `npm run test:e2e`.
 * DECISION: Two projects (ar / en) so reports clearly separate RTL vs LTR runs.
 *           The main-entry path is centralized in e2e/helpers.ts so each test
 *           launches its own Electron instance consistently.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'ar-rtl',
      use: { locale: 'ar-JO' }
    },
    {
      name: 'en-ltr',
      use: { locale: 'en-US' }
    }
  ]
})
