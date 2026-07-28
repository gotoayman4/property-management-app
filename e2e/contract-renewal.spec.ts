/**
 * @file contract-renewal.spec.ts — Critical-flow E2E: manual contract renewal.
 *
 * INTENT: Verify the manual renewal flow end-to-end in both RTL (Arabic) and LTR
 *         (English): create a property + tenant + active contract, open the renewal
 *         dialog from the list row, and exercise the happy path (accept the smart
 *         defaults → contract renewed) and the failure path (new end date before the
 *         renewal start date → in-form validation error, dialog stays open).
 *
 * CONSTRAINTS:
 *   - AGENTS.md: dual-direction coverage mandatory — both ar-rtl and en-ltr projects
 *     run the same test body.
 *   - Each test launches a fresh Electron instance (clean database), so no shared state.
 *   - Playwright auto-waits on role+name locators; selectors match both languages.
 *
 * CAVEAT: The app must be built before running (`npm run build`). These tests exercise
 *         the full stack: renderer UI → IPC → SQLite → IPC → renderer update.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers'

let app: ElectronApplication
let window: Page

test.beforeEach(async () => {
  ;({ app, window } = await launchApp())
})

test.afterEach(async () => {
  await app.close()
})

/** Create a property, a tenant, and an ACTIVE contract linking them (renewable state). */
async function seedActiveContract(win: Page, contractNumber: string): Promise<void> {
  const nav = win.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // ── Property ──
  await nav.locator('a[href="#/properties"]').click()
  await win
    .getByRole('button', { name: /add.*property|إضافة.*عقار/i })
    .first()
    .click()
  await expect(win.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await win.getByLabel(/property name|اسم العقار/i).fill('Renewal Property')
  const rentField = win.getByLabel(/default monthly rent|الإيجار الشهري/i)
  await rentField.click()
  await rentField.fill('1000')
  await win.getByRole('button', { name: /^save$|^حفظ$/i }).click()
  await expect(win.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

  // ── Tenant ──
  await nav.locator('a[href="#/tenants"]').click()
  await win
    .getByRole('button', { name: /add.*tenant|إضافة.*مستأجر/i })
    .first()
    .click()
  await expect(win.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
  await win.getByLabel(/full name|الاسم الكامل/i).fill('Renewal Tenant')
  await win.getByLabel(/phone number|رقم الهاتف/i).fill('5551230000')
  await win.getByRole('button', { name: /^save$|^حفظ$/i }).click()
  await expect(win.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

  // ── Contract (status = Active) ──
  await nav.locator('a[href="#/contracts"]').click()
  await win
    .getByRole('button', { name: /create contract|إنشاء عقد/i })
    .first()
    .click()
  await expect(win.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

  await win.getByLabel(/contract number|رقم العقد/i).fill(contractNumber)

  // Status → Active
  await win.getByLabel(/^status$|^الحالة$/i).click()
  await win.getByRole('option', { name: /^active$|^نشط$/i }).click()

  // Property + tenant selects
  await win.getByLabel(/select property|اختر العقار/i).click()
  await win.getByRole('option', { name: /renewal property/i }).click()
  await win.getByLabel(/select tenant|اختر المستأجر/i).click()
  await win.getByRole('option', { name: /renewal tenant/i }).click()

  // Term dates (rent auto-fills from the property default).
  await win.getByLabel(/start date|تاريخ البدء/i).fill('2026-01-01')
  await win.getByLabel(/end date|تاريخ الانتهاء/i).fill('2026-12-31')

  await win.getByRole('button', { name: /^save$|^حفظ$/i }).click()
  // The create form stays open showing a Close button after a successful save.
  await win.getByRole('button', { name: /^close$|^إغلاق$/i }).click()
  await expect(win.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

  // The new contract row is visible in the list.
  await expect(win.getByText(contractNumber)).toBeVisible({ timeout: 10_000 })
}

test('manual renewal happy path — accept smart defaults renews the contract', async () => {
  await seedActiveContract(window, 'C-RENEW-OK')

  // Open the renewal dialog from the row action.
  await window
    .getByRole('button', { name: /^renew$|^تجديد$/i })
    .first()
    .click()
  const dialog = window.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  // Smart defaults pre-fill the new term; accept them and submit.
  await window.getByRole('button', { name: /^renew$|^تجديد$/i }).click()

  // The renewal dialog closes on success.
  await expect(dialog).not.toBeVisible({ timeout: 10_000 })
})

test('manual renewal failure path — new end before renewal start blocks submit', async () => {
  await seedActiveContract(window, 'C-RENEW-BAD')

  await window
    .getByRole('button', { name: /^renew$|^تجديد$/i })
    .first()
    .click()
  const dialog = window.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  // Force an invalid term: end date before the renewal start date.
  await window.getByLabel(/renewal start date|تاريخ بدء التجديد/i).fill('2027-01-01')
  await window.getByLabel(/new end date|تاريخ الانتهاء الجديد/i).fill('2026-06-01')

  await window.getByRole('button', { name: /^renew$|^تجديد$/i }).click()

  // In-form validation blocks the submit and surfaces the error; the dialog stays open.
  await expect(
    window.getByText(/must be after the renewal start date|يجب أن يكون بعد تاريخ بدء التجديد/i)
  ).toBeVisible({ timeout: 10_000 })
  await expect(dialog).toBeVisible()
})
