/**
 * @file financial.spec.ts — Critical-flow E2E: property → tenant → payment → ledger.
 *
 * INTENT: Verify the core financial pipeline works end-to-end in both RTL (Arabic) and
 *         LTR (English). Creates the minimum data needed (one property, one tenant, one
 *         payment) then asserts the ledger reflects the recorded amount.
 *
 * CONSTRAINTS:
 *   - AGENTS.md: dual-direction coverage mandatory — both ar-rtl and en-ltr projects
 *     run the same test body.
 *   - Each test launches a fresh Electron instance (clean database), so no shared state.
 *   - Playwright auto-waits on role+name locators; no arbitrary sleeps.
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

test('payment recorded from property creation flow appears in ledger', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // ── Step 1: Create a property ──
  await nav.locator('a[href="#/properties"]').click()
  await window
    .getByRole('button', { name: /add.*property|إضافة.*عقار/i })
    .first()
    .click()
  await expect(window.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

  // Fill property name (required field)
  await window.getByLabel(/property name|اسم العقار/i).fill('Test Property')

  // Fill default monthly rent (required field) — CurrencyInput uses a text field
  const rentField = window.getByLabel(/default monthly rent|الإيجار الشهري/i)
  await rentField.click()
  await rentField.fill('1000')

  // Save
  await window.getByRole('button', { name: /^save$|^حفظ$/i }).click()

  // Wait for dialog to close — property created
  await expect(window.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

  // ── Step 2: Create a tenant ──
  await nav.locator('a[href="#/tenants"]').click()
  await window
    .getByRole('button', { name: /add.*tenant|إضافة.*مستأجر/i })
    .first()
    .click()
  await expect(window.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

  // Fill full name (required)
  await window.getByLabel(/full name|الاسم الكامل/i).fill('John Doe')

  // Fill phone (required) — forced LTR
  await window.getByLabel(/phone number|رقم الهاتف/i).fill('5551234567')

  // Save
  await window.getByRole('button', { name: /^save$|^حفظ$/i }).click()
  await expect(window.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

  // ── Step 3: Record a payment ──
  await nav.locator('a[href="#/payments"]').click()
  await window
    .getByRole('button', { name: /record payment|تسجيل دفعة/i })
    .first()
    .click()
  await expect(window.getByRole('dialog')).toBeVisible({ timeout: 10_000 })

  // Select property from dropdown
  await window
    .getByLabel(/property$/i)
    .first()
    .click()
  await window.getByRole('option', { name: /test property/i }).click()

  // Select payment type — default may already be "Rent", but set it explicitly
  const paymentTypeSelect = window.getByLabel(/payment type|نوع الدفعة/i)
  await paymentTypeSelect.click()
  await window
    .getByRole('option', { name: /rent|إيجار/i })
    .first()
    .click()

  // Set amount — CurrencyInput
  const amountField = window.getByLabel(/amount received|المبلغ المستلم/i)
  await amountField.click()
  await amountField.fill('500')

  // Save payment
  await window.getByRole('button', { name: /^save$|^حفظ$/i }).click()
  await expect(window.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })

  // ── Step 4: Verify payment appears in the payments table ──
  await expect(window.getByText('500')).toBeVisible({ timeout: 10_000 })

  // ── Step 5: Verify ledger reflects the payment ──
  await nav.locator('a[href="#/ledger"]').click()
  await expect(window.getByRole('heading', { name: /ledger|دفتر الأستاذ/i })).toBeVisible({
    timeout: 10_000
  })

  // Select the property in the ledger filter
  await window
    .getByLabel(/property$/i)
    .first()
    .click()
  await window.getByRole('option', { name: /test property/i }).click()

  // The ledger should show a debit entry for the payment
  await expect(window.getByText('500')).toBeVisible({ timeout: 10_000 })
})

test('payments page loads and record dialog opens correctly', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Navigate to payments
  await nav.locator('a[href="#/payments"]').click()

  // Page heading is visible
  await expect(window.getByRole('heading', { name: /payment|دفعة/i })).toBeVisible({
    timeout: 10_000
  })

  // "Record Payment" button is present
  const addBtn = window.getByRole('button', { name: /record payment|تسجيل دفعة/i }).first()
  await expect(addBtn).toBeVisible()

  // Clicking it opens the dialog
  await addBtn.click()
  const dialog = window.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  // The dialog contains Save and Cancel buttons
  await expect(window.getByRole('button', { name: /^save$|^حفظ$/i })).toBeVisible()
  await expect(window.getByRole('button', { name: /^cancel$|^إلغاء$/i })).toBeVisible()

  // Cancel closes the dialog
  await window.getByRole('button', { name: /^cancel$|^إلغاء$/i }).click()
  await expect(dialog).not.toBeVisible({ timeout: 5_000 })
})

test('ledger page loads with filter controls', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Navigate to ledger
  await nav.locator('a[href="#/ledger"]').click()

  // Page heading visible
  await expect(window.getByRole('heading', { name: /ledger|دفتر الأستاذ/i })).toBeVisible({
    timeout: 10_000
  })

  // Property filter is present
  await expect(window.getByLabel(/property$/i).first()).toBeVisible()

  // Clear filters button is present
  await expect(window.getByRole('button', { name: /clear filter|مسح الفلتر/i })).toBeVisible()
})
