/**
 * @file propertyProfitability.test — tests for the properties:profitability IPC handler.
 *
 * INTENT: Verify the main-process profitability computation replaces the renderer-side
 *         calculation anti-pattern. Sums are aggregated from the DB, voided rows excluded.
 * CONSTRAINT: Uses the same Electron mock pattern as reportsIpc.test.ts and dashboardIpc.test.ts.
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
import { registerPropertyIpcHandlers } from '../propertyIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

describe('properties:profitability', () => {
  let registry: IpcRegistry
  let propertyId: number

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerPropertyIpcHandlers()

    const prop = testDb
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('PP-1', 'Profit Property', 'apartment', 'JO', 'JOD', 'rented', 500)`
      )
      .run()
    propertyId = Number(prop.lastInsertRowid)
  })

  it('returns zero values when no payments or expenses exist', async () => {
    const result = (await invoke(registry, 'properties:profitability', {
      property_id: propertyId
    })) as {
      totalIncome: number
      totalExpenses: number
      netProfit: number
      paymentCount: number
      expenseCount: number
    }

    expect(result.totalIncome).toBe(0)
    expect(result.totalExpenses).toBe(0)
    expect(result.netProfit).toBe(0)
    expect(result.paymentCount).toBe(0)
    expect(result.expenseCount).toBe(0)
  })

  it('sums non-voided payments as totalIncome', async () => {
    testDb
      .prepare(
        `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
         VALUES (?, 'rent', '2026-07-01', 500, 'JOD', 'RCT-PP-001')`
      )
      .run(propertyId)
    testDb
      .prepare(
        `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
         VALUES (?, 'rent', '2026-07-02', 300, 'JOD', 'RCT-PP-002')`
      )
      .run(propertyId)

    const result = (await invoke(registry, 'properties:profitability', {
      property_id: propertyId
    })) as { totalIncome: number; paymentCount: number }

    expect(result.totalIncome).toBe(800)
    expect(result.paymentCount).toBe(2)
  })

  it('sums non-voided expenses as totalExpenses', async () => {
    const cat = testDb
      .prepare("SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'")
      .get() as { id: number }

    testDb
      .prepare(
        `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
         VALUES (?, ?, '2026-07-03', 150, 'JOD')`
      )
      .run(propertyId, cat.id)

    const result = (await invoke(registry, 'properties:profitability', {
      property_id: propertyId
    })) as { totalExpenses: number; expenseCount: number }

    expect(result.totalExpenses).toBe(150)
    expect(result.expenseCount).toBe(1)
  })

  it('excludes voided payments and expenses from totals', async () => {
    testDb
      .prepare(
        `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number, is_voided)
         VALUES (?, 'rent', '2026-07-01', 500, 'JOD', 'RCT-PP-V1', 1)`
      )
      .run(propertyId)
    testDb
      .prepare(
        `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
         VALUES (?, 'rent', '2026-07-02', 300, 'JOD', 'RCT-PP-V2')`
      )
      .run(propertyId)

    const cat = testDb
      .prepare("SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'")
      .get() as { id: number }
    testDb
      .prepare(
        `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency, is_voided)
         VALUES (?, ?, '2026-07-03', 200, 'JOD', 1)`
      )
      .run(propertyId, cat.id)

    const result = (await invoke(registry, 'properties:profitability', {
      property_id: propertyId
    })) as {
      totalIncome: number
      totalExpenses: number
      paymentCount: number
      expenseCount: number
    }

    expect(result.totalIncome).toBe(300)
    expect(result.paymentCount).toBe(1)
    expect(result.totalExpenses).toBe(0)
    expect(result.expenseCount).toBe(0)
  })

  it('computes netProfit as income minus expenses', async () => {
    testDb
      .prepare(
        `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
         VALUES (?, 'rent', '2026-07-01', 1000, 'JOD', 'RCT-PP-NP1')`
      )
      .run(propertyId)
    const cat = testDb
      .prepare("SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'")
      .get() as { id: number }
    testDb
      .prepare(
        `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
         VALUES (?, ?, '2026-07-03', 400, 'JOD')`
      )
      .run(propertyId, cat.id)

    const result = (await invoke(registry, 'properties:profitability', {
      property_id: propertyId
    })) as { totalIncome: number; totalExpenses: number; netProfit: number }

    expect(result.netProfit).toBe(600)
  })

  it('returns negative netProfit when expenses exceed income', async () => {
    testDb
      .prepare(
        `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
         VALUES (?, 'rent', '2026-07-01', 100, 'JOD', 'RCT-PP-NP2')`
      )
      .run(propertyId)
    const cat = testDb
      .prepare("SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'")
      .get() as { id: number }
    testDb
      .prepare(
        `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
         VALUES (?, ?, '2026-07-03', 500, 'JOD')`
      )
      .run(propertyId, cat.id)

    const result = (await invoke(registry, 'properties:profitability', {
      property_id: propertyId
    })) as { netProfit: number }

    expect(result.netProfit).toBe(-400)
  })

  it('throws INVALID_INPUT when property_id is missing', async () => {
    await expect(invoke(registry, 'properties:profitability', {})).rejects.toThrow('INVALID_INPUT')
  })
})
