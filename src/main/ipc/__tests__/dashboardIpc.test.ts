/**
 * @file dashboardIpc.test — tests for the dashboard financial aggregation IPC handlers.
 *
 * INTENT: Verify per-currency income/expense/netProfit aggregation, consolidated summary
 *         using frozen exchange-rate snapshots, country filtering, and voided-row exclusion.
 * CONSTRAINT: Electron and the database module are mocked; tests run against an in-memory DB
 *             using the same pattern as reportsIpc.test.ts.
 */
import { ipcMain } from 'electron'
// eslint-disable-next-line import-x/order -- vitest mock pattern requires split imports
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))

import { runMigrations } from '../../db/migrations'
import { registerDashboardIpcHandlers } from '../dashboardIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

describe('dashboardIpc', () => {
  let registry: IpcRegistry
  let propertyJod: number
  let propertyTry: number
  let tenantId: number

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerDashboardIpcHandlers()

    // Seed properties.
    const propJod = testDb
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('D-JOD', 'JOD Apt', 'apartment', 'JO', 'JOD', 'rented', 500)`
      )
      .run()
    propertyJod = Number(propJod.lastInsertRowid)

    const propTry = testDb
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('D-TRY', 'TRY Shop', 'shop', 'TR', 'TRY', 'rented', 8000)`
      )
      .run()
    propertyTry = Number(propTry.lastInsertRowid)

    // Seed a tenant.
    const tenant = testDb
      .prepare(
        `INSERT INTO tenants (code, fullname, phone, is_active)
         VALUES ('DT-1', 'Dashboard Tenant', '0790000000', 1)`
      )
      .run()
    tenantId = Number(tenant.lastInsertRowid)
  })

  function seedCurrentMonthPayments(): void {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    testDb
      .prepare(
        `INSERT INTO payments (property_id, tenant_id, payment_type, payment_date, amount, currency, receipt_number, base_amount, reporting_currency)
         VALUES (?, ?, 'rent', ? || '-15', 500, 'JOD', 'RCT-DASH-001', 500, 'JOD')`
      )
      .run(propertyJod, tenantId, ym)
    testDb
      .prepare(
        `INSERT INTO payments (property_id, tenant_id, payment_type, payment_date, amount, currency, receipt_number, base_amount, reporting_currency)
         VALUES (?, ?, 'rent', ? || '-16', 8000, 'TRY', 'RCT-DASH-002', 250, 'JOD')`
      )
      .run(propertyTry, tenantId, ym)
  }

  function seedCurrentMonthExpenses(): void {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const cat = testDb
      .prepare("SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'")
      .get() as { id: number }
    testDb
      .prepare(
        `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency, base_amount, reporting_currency)
         VALUES (?, ?, ? || '-10', 100, 'JOD', 100, 'JOD')`
      )
      .run(propertyJod, cat.id, ym)
    testDb
      .prepare(
        `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency, base_amount, reporting_currency)
         VALUES (?, ?, ? || '-11', 2000, 'TRY', 63, 'JOD')`
      )
      .run(propertyTry, cat.id, ym)
  }

  describe('dashboard:summary', () => {
    it('returns correct property and tenant counts', () => {
      const result = invoke(registry, 'dashboard:summary') as Promise<{
        totalProperties: number
        rentedProperties: number
        totalTenants: number
        activeContracts: number
      }>
      return result.then((r) => {
        expect(r.totalProperties).toBe(2)
        expect(r.rentedProperties).toBe(2)
        expect(r.totalTenants).toBe(1)
      })
    })

    it('returns per-currency financial summary for current month', async () => {
      seedCurrentMonthPayments()
      seedCurrentMonthExpenses()

      const result = (await invoke(registry, 'dashboard:summary')) as {
        financialSummary: Array<{
          currency: string
          income: number
          expenses: number
          netProfit: number
        }>
      }

      expect(result.financialSummary.length).toBeGreaterThanOrEqual(2)

      const jod = result.financialSummary.find((r) => r.currency === 'JOD')
      expect(jod).toBeDefined()
      expect(jod?.income).toBe(500)
      expect(jod?.expenses).toBe(100)
      expect(jod?.netProfit).toBe(400)

      const tryRow = result.financialSummary.find((r) => r.currency === 'TRY')
      expect(tryRow).toBeDefined()
      expect(tryRow?.income).toBe(8000)
      expect(tryRow?.expenses).toBe(2000)
      expect(tryRow?.netProfit).toBe(6000)
    })

    it('returns consolidated summary using frozen snapshots', async () => {
      seedCurrentMonthPayments()
      seedCurrentMonthExpenses()

      const result = (await invoke(registry, 'dashboard:summary')) as {
        consolidatedSummary: {
          reporting_currency: string
          total_income: number
          total_expenses: number
          total_net_profit: number
        }
      }

      expect(result.consolidatedSummary.reporting_currency).toBe('JOD')
      // Income snapshots: 500 (JOD) + 250 (TRY base_amount) = 750
      expect(result.consolidatedSummary.total_income).toBe(750)
      // Expense snapshots: 100 (JOD) + 63 (TRY base_amount) = 163
      expect(result.consolidatedSummary.total_expenses).toBe(163)
      expect(result.consolidatedSummary.total_net_profit).toBe(587)
    })

    it('excludes voided payments and expenses from aggregation', async () => {
      seedCurrentMonthPayments()
      seedCurrentMonthExpenses()

      // Void all payments.
      testDb.prepare('UPDATE payments SET is_voided = 1').run()

      const result = (await invoke(registry, 'dashboard:summary')) as {
        financialSummary: Array<{
          currency: string
          income: number
          expenses: number
          netProfit: number
        }>
        consolidatedSummary: { total_income: number; total_expenses: number }
      }

      result.financialSummary.forEach((r) => {
        expect(r.income).toBe(0)
      })
      expect(result.consolidatedSummary.total_income).toBe(0)
      // Expenses still present.
      expect(result.consolidatedSummary.total_expenses).toBe(163)
    })

    it('filters by country', async () => {
      seedCurrentMonthPayments()
      seedCurrentMonthExpenses()

      const result = (await invoke(registry, 'dashboard:summary', 'JO')) as {
        financialSummary: Array<{
          currency: string
          income: number
          expenses: number
        }>
        totalProperties: number
      }

      expect(result.totalProperties).toBe(1)
      const jod = result.financialSummary.find((r) => r.currency === 'JOD')
      expect(jod?.income).toBe(500)
      // TRY property is in TR, should not appear.
      const tryRow = result.financialSummary.find((r) => r.currency === 'TRY')
      expect(tryRow).toBeUndefined()
    })
  })

  describe('dashboard:trends', () => {
    it('returns income and expense trends grouped by month', async () => {
      const now = new Date()
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      testDb
        .prepare(
          `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
           VALUES (?, 'rent', ? || '-01', 300, 'JOD', 'RCT-TREND-001')`
        )
        .run(propertyJod, ym)
      testDb
        .prepare(
          `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
           VALUES (?, 1, ? || '-02', 50, 'JOD')`
        )
        .run(propertyJod, ym)

      const result = (await invoke(registry, 'dashboard:trends')) as {
        income: Array<{ month: string; total: number; currency: string }>
        expense: Array<{ month: string; total: number; currency: string }>
      }

      expect(result.income.length).toBeGreaterThanOrEqual(1)
      const incomeMonth = result.income.find((r) => r.month === ym)
      expect(incomeMonth?.total).toBe(300)
      expect(incomeMonth?.currency).toBe('JOD')

      expect(result.expense.length).toBeGreaterThanOrEqual(1)
      const expenseMonth = result.expense.find((r) => r.month === ym)
      expect(expenseMonth?.total).toBe(50)
    })

    it('filters trends by country', async () => {
      const now = new Date()
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      testDb
        .prepare(
          `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
           VALUES (?, 'rent', ? || '-01', 500, 'JOD', 'RCT-TREND-002')`
        )
        .run(propertyJod, ym)
      testDb
        .prepare(
          `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
           VALUES (?, 'rent', ? || '-01', 8000, 'TRY', 'RCT-TREND-003')`
        )
        .run(propertyTry, ym)

      const result = (await invoke(registry, 'dashboard:trends', 'JO')) as {
        income: Array<{ month: string; total: number; currency: string }>
      }

      // Only JO property should appear.
      const jodIncome = result.income.filter((r) => r.currency === 'JOD')
      const tryIncome = result.income.filter((r) => r.currency === 'TRY')
      expect(jodIncome.length).toBeGreaterThanOrEqual(1)
      expect(tryIncome).toHaveLength(0)
    })
  })

  describe('dashboard:recentPayments', () => {
    it('returns the 5 most recent non-voided payments', async () => {
      for (let i = 1; i <= 6; i++) {
        testDb
          .prepare(
            `INSERT INTO payments (property_id, tenant_id, payment_type, payment_date, amount, currency, receipt_number)
             VALUES (?, ?, 'rent', '2026-07-0' + ?, 100 * ?, 'JOD', 'RCT-REC-' + ?)`
          )
          .run(propertyJod, tenantId, String(i), i, String(i).padStart(6, '0'))
      }
      // Void one payment.
      testDb
        .prepare('UPDATE payments SET is_voided = 1 WHERE receipt_number = ?')
        .run('RCT-REC-000003')

      const result = (await invoke(registry, 'dashboard:recentPayments')) as Array<{
        receipt_number: string
      }>
      expect(result).toHaveLength(5)
      expect(result.map((r) => r.receipt_number)).not.toContain('RCT-REC-000003')
    })
  })
})
