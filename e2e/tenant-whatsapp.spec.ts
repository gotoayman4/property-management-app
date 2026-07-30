import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

/**
 * INTENT: E2E for the WhatsApp action button embedded in the tenant form's phone field.
 *         Verifies: (1) button is disabled while the phone field is empty, (2) becomes
 *         enabled once a phone number is typed, (3) clicking it opens a wa.me URL built
 *         from country code + phone, (4) clearing the phone disables it again.
 * DECISION: The Electron main process routes window.open to shell.openExternal (and
 *           denies the window), so we stub window.open in the renderer and capture the
 *           URL instead of asserting on an external browser launch.
 * CAVEAT: Selectors use the aria-label i18n text for both languages so the same spec
 *         passes under the ar-rtl and en-ltr Playwright projects.
 */

let app: ElectronApplication
let window: Page

const WHATSAPP_LABEL = /send whatsapp message|إرسال رسالة واتساب/i

test.beforeEach(async () => {
  ;({ app, window } = await launchApp())
})

test.afterEach(async () => {
  await app.close()
})

test('tenant form WhatsApp button: disabled when empty, opens wa.me with the typed number', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })
  await nav.locator('a[href="#/tenants"]').click()

  // Open the Add Tenant dialog
  await window
    .getByRole('button', { name: /add|إضافة/i })
    .first()
    .click()
  const dialog = window.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  const whatsappButton = dialog.getByRole('button', { name: WHATSAPP_LABEL })
  await expect(whatsappButton).toBeVisible()

  // (1) Disabled while the phone field is empty
  await expect(whatsappButton).toBeDisabled()

  // Fill country code + phone. Placeholders are language-independent anchors:
  // the country-code field uses the literal "962" placeholder.
  await dialog.getByPlaceholder('962').fill('962')
  const phoneInput = dialog.locator('input[name="phone"]')
  await phoneInput.fill('791234567')

  // (2) Enabled once a phone number exists
  await expect(whatsappButton).toBeEnabled()

  // (3) Capture the URL window.open is called with (main denies the popup and
  // hands the URL to shell.openExternal, so we intercept in the renderer).
  await window.evaluate(() => {
    ;(window as unknown as { __openedUrls: string[] }).__openedUrls = []
    window.open = ((url: string) => {
      ;(window as unknown as { __openedUrls: string[] }).__openedUrls.push(String(url))
      return null
    }) as typeof window.open
  })
  await whatsappButton.click()
  const openedUrls = await window.evaluate(
    () => (window as unknown as { __openedUrls: string[] }).__openedUrls
  )
  expect(openedUrls).toHaveLength(1)
  expect(openedUrls[0]).toBe('https://wa.me/962791234567')

  // (4) Clearing the phone disables the button again
  await phoneInput.fill('')
  await expect(whatsappButton).toBeDisabled()
})
