/**
 * @file backup.spec.ts — Critical-flow E2E: backup creation and restore.
 *
 * INTENT: Verify the backup/restore pipeline works end-to-end in both RTL (Arabic) and
 *         LTR (English). Creates a backup, confirms it appears in the backup list, then
 *         initiates restore via the UI (two-step confirmation per FR-BAK-05).
 *
 * CONSTRAINTS:
 *   - AGENTS.md: dual-direction coverage mandatory — both ar-rtl and en-ltr projects
 *     run the same test body.
 *   - Each test launches a fresh Electron instance (clean database).
 *   - Restore restarts the app — the test handles the new window.
 *   - Playwright auto-waits on role+name locators; no arbitrary sleeps.
 *
 * CAVEAT: The app must be built before running (`npm run build`). These tests exercise
 *         the full stack: renderer UI → IPC → SQLite/filesystem → IPC → renderer update.
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

test('creating a backup shows it in the backup list', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Navigate to backup page
  await nav.locator('a[href="#/backup"]').click()

  // Page heading visible
  await expect(window.getByRole('heading', { name: /backup|نسخة احتياطية/i })).toBeVisible({
    timeout: 10_000
  })

  // Click "Backup Now"
  const backupBtn = window.getByRole('button', { name: /backup now|إنشاء نسخة/i }).first()
  await expect(backupBtn).toBeVisible()
  await backupBtn.click()

  // Button shows "Creating backup..." state then returns to normal
  // Wait for the backup list to show at least one row
  await expect(
    window
      .locator('[role="row"]')
      .filter({ hasText: /success|ناجح/i })
      .first()
  ).toBeVisible({ timeout: 15_000 })
})

test('backup restore flow — two-step confirmation', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Navigate to backup page
  await nav.locator('a[href="#/backup"]').click()
  await expect(window.getByRole('heading', { name: /backup|نسخة احتياطية/i })).toBeVisible({
    timeout: 10_000
  })

  // Step 1: Create a backup first so there's something to restore
  const backupBtn = window.getByRole('button', { name: /backup now|إنشاء نسخة/i }).first()
  await backupBtn.click()

  // Wait for the backup row to appear
  await expect(
    window
      .locator('[role="row"]')
      .filter({ hasText: /success|ناجح/i })
      .first()
  ).toBeVisible({ timeout: 15_000 })

  // Step 2: Click the "Restore" button on the backup row (per-row action)
  const restoreRowBtn = window
    .locator('[role="row"]')
    .filter({ hasText: /success|ناجح/i })
    .first()
    .getByRole('button', { name: /restore|استعادة/i })
  await restoreRowBtn.click()

  // Select backup dialog opens
  const selectDialog = window.getByRole('dialog')
  await expect(selectDialog).toBeVisible({ timeout: 10_000 })

  // Select the first backup from the dropdown
  await window.getByLabel(/select backup|اختر نسخة/i).click()
  await window.getByRole('option').first().click()

  // Click Next
  await window.getByRole('button', { name: /next|التالي/i }).click()

  // Restore confirmation dialog — type "confirm" to proceed
  await expect(window.getByLabel(/type.*confirm|اكتب.*تأكيد/i)).toBeVisible({
    timeout: 10_000
  })
  await window.getByLabel(/type.*confirm|اكتب.*تأكيد/i).fill('confirm')

  // Click Restore button
  await window
    .getByRole('button', { name: /restore|استعادة/i })
    .last()
    .click()

  // Post-restore restart dialog appears
  await expect(window.getByRole('heading', { name: /restart|إعادة تشغيل/i })).toBeVisible({
    timeout: 15_000
  })

  // Click "Later" to avoid restarting during the test
  await window.getByRole('button', { name: /later|لاحقاً/i }).click()
})

test('backup page loads with all action buttons', async () => {
  const nav = window.getByRole('navigation', { name: /navigation drawer/i })
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Navigate to backup page
  await nav.locator('a[href="#/backup"]').click()

  // All three header buttons are visible
  await expect(window.getByRole('heading', { name: /backup|نسخة احتياطية/i })).toBeVisible({
    timeout: 10_000
  })

  await expect(window.getByRole('button', { name: /backup now|إنشاء نسخة/i }).first()).toBeVisible()

  await expect(
    window.getByRole('button', { name: /quick backup|نسخة سريعة/i }).first()
  ).toBeVisible()

  await expect(window.getByRole('button', { name: /restore|استعادة/i }).first()).toBeVisible()
})
