import { resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

/**
 * INTENT: Shared Electron launch helper for E2E tests.
 * CONSTRAINT: The app must be built first (`npm run build`) — Playwright launches
 *             the compiled main-process entry at out/main/index.js.
 */

const MAIN_ENTRY = resolve(__dirname, '..', 'out', 'main', 'index.js')

/**
 * Launch the built Electron app and return the app handle plus its first window.
 * Throws if no window appears within the default timeout.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  // Pass the built main-process entry as the arg; Playwright supplies its own
  // Electron runtime (no executablePath needed for local app launches).
  const app = await electron.launch({ args: [MAIN_ENTRY] })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  return { app, window }
}
