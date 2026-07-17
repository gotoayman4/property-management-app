import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * INTENT: Smoke-test that the app boots and core navigation works in both RTL and LTR.
 * CONSTRAINT: This is the critical-flow E2E required by AGENTS (dual-direction coverage).
 * DECISION: Selectors target roles + accessible names scoped to the navigation region, so
 *           they are unambiguous (the page heading duplicates the nav label). Both projects
 *           (ar-rtl / en-ltr) run the same assertions; the in-app language toggle verifies
 *           direction actually flips.
 * CAVEAT: Tests launch the built app — run `npm run build` before `npm run test:e2e`.
 */

let app: ElectronApplication
let window: Page

test.beforeEach(async () => {
  ;({ app, window } = await launchApp())
})

test.afterEach(async () => {
  await app.close()
})

test('app boots and sidebar navigation works', async () => {
  // The navigation drawer is present after boot
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Navigate via nav links. Locators match by URL hash which is language-independent,
  // so the same selector resolves correctly in both RTL (Arabic) and LTR (English).
  await nav.locator('a[href="#/properties"]').click()
  await nav.locator('a[href="#/tenants"]').click()
  await nav.locator('a[href="#/contracts"]').click()
  await nav.locator('a[href="#/settings"]').click()
})

test('opening the Add Property dialog', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await nav.locator('a[href="#/properties"]').click()

  // The Add button is the primary action on the properties page.
  // Matches both "Add" (en) and the Arabic add label.
  await window
    .getByRole('button', { name: /add|إضافة/i })
    .first()
    .click()

  // The dialog region appears
  await expect(window.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
})

test('language toggle flips document direction between RTL and LTR', async () => {
  // Record the initial direction set on boot
  const initialDir = await window.evaluate(() => document.documentElement.dir)
  expect(['rtl', 'ltr']).toContain(initialDir)

  // Click the in-AppBar language toggle (button whose label switches to the OTHER language)
  await window
    .getByRole('button', { name: /english|العربية/i })
    .first()
    .click()

  // Direction must flip to the opposite value
  const toggledDir = await window.evaluate(() => document.documentElement.dir)
  expect(toggledDir).not.toBe(initialDir)
  expect(['rtl', 'ltr']).toContain(toggledDir)
})
