/**
 * INTENT: Behavioural IPC tests for recurringExpenseIpc (now posts expenses+ledger),
 *         notificationIpc (lease-end + recurring-due evaluation), exchangeRateIpc
 *         (list/add/duplicate guard), and searchIpc (global search).
 * CONSTRAINT: Electron + db mocked. Currency handling via ExpenseError/BR-13 exercised
 *             indirectly through recurring evaluation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  net: { fetch: vi.fn() }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))

import {
  registerRecurringExpenseIpcHandlers,
  evaluateRecurringExpenses
} from '../recurringExpenseIpc'
import { registerNotificationIpcHandlers } from '../notificationIpc'
import { registerExchangeRateIpcHandlers } from '../exchangeRateIpc'
import { registerSearchIpcHandlers } from '../searchIpc'
import { runMigrations } from '../../db/migrations'

// Reset domain data after every test so cases within the same describe don't leak rows.
afterEach((): void => resetDb(testDb))

let propertySeq = 0
function seedProperty(name = 'Test Property', currency = 'JOD'): number {
  propertySeq += 1
  return testDb
    .prepare(
      `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
       VALUES (?, ?, 'apartment', 'JO', ?, 'vacant', 0)`
    )
    .run(`P-${propertySeq}`, name, currency).lastInsertRowid as number
}

function seedTenant(): number {
  return testDb
    .prepare("INSERT INTO tenants (code, fullname, phone, is_active) VALUES (?, ?, '000', 1)")
    .run(`T-${propertySeq}`, `Tenant ${propertySeq}`).lastInsertRowid as number
}

describe('recurringExpenseIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerRecurringExpenseIpcHandlers()
  })

  function seedTemplate(startDate: string, active = 1): number {
    const propertyId = seedProperty('Recurring Prop', 'JOD')
    return testDb
      .prepare(
        `INSERT INTO recurring_expense_templates
         (property_id, category_id, description, amount, currency, frequency, day_of_month, start_date, is_active)
         VALUES (?, 1, 'Cleaning', 100, 'JOD', 'monthly', 1, ?, ?)`
      )
      .run(propertyId, startDate, active).lastInsertRowid as number
  }

  it('evaluates a due recurring expense and posts an expense + ledger entry atomically', async () => {
    // start_date one month ago -> exactly one generation up to today.
    const start = new Date()
    start.setMonth(start.getMonth() - 1, 1)
    const startDate = start.toISOString().split('T')[0]
    seedTemplate(startDate)

    evaluateRecurringExpenses()

    const expCount = testDb.prepare('SELECT COUNT(*) AS c FROM expenses').get() as { c: number }
    expect(expCount.c).toBeGreaterThanOrEqual(1)
    const ledgerCount = testDb.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get() as {
      c: number
    }
    expect(ledgerCount.c).toBe(expCount.c)
    const exp = testDb.prepare('SELECT notes FROM expenses').get() as { notes: string }
    expect(exp.notes).toContain('Cleaning')
  })

  it('advances last_generated_date after generation', async () => {
    const start = new Date()
    start.setMonth(start.getMonth() - 1, 1)
    const startDate = start.toISOString().split('T')[0]
    seedTemplate(startDate)

    evaluateRecurringExpenses()
    const row = testDb
      .prepare('SELECT last_generated_date FROM recurring_expense_templates')
      .get() as { last_generated_date: string | null }
    // The latest generated month-start on/before today with day_of_month = 1.
    const expected = new Date()
    expected.setDate(1)
    expect(row.last_generated_date).toBe(expected.toISOString().split('T')[0])
  })

  it('skips inactive recurring templates', async () => {
    const start = new Date()
    start.setMonth(start.getMonth() - 1, 1)
    seedTemplate(start.toISOString().split('T')[0], 0)

    evaluateRecurringExpenses()
    const expCount = testDb.prepare('SELECT COUNT(*) AS c FROM expenses').get() as { c: number }
    expect(expCount.c).toBe(0)
  })

  it('creates a template via the IPC channel', async () => {
    const propertyId = seedProperty()
    const res = (await invoke(registry, 'recurringExpenses:create', {
      property_id: propertyId,
      category_id: 1,
      description: 'Monthly cleaning',
      amount: 50,
      currency: 'JOD',
      frequency: 'monthly',
      day_of_month: 5,
      start_date: '2026-01-01'
    })) as { id: number }
    expect(res.id).toBeGreaterThan(0)
  })
})

describe('notificationIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerNotificationIpcHandlers()
  })

  it('generates a contract-expiry notification for a lease ending within the window', async () => {
    const propertyId = seedProperty()
    const tenantId = seedTenant()
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    testDb
      .prepare(
        `INSERT INTO contracts
         (contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency, status)
         VALUES ('C-1', ?, ?, '2020-01-01', ?, 500, 'JOD', 'active')`
      )
      .run(propertyId, tenantId, soon)

    // evaluateNotifications is exported; call directly to exercise the evaluator.
    const { evaluateNotifications } = await import('../notificationIpc')
    evaluateNotifications()

    const rows = testDb
      .prepare("SELECT * FROM notifications WHERE notification_type = 'contract_expiry'")
      .all() as Array<{ notification_type: string }>
    expect(rows.length).toBe(1)
  })

  it('lists pending notifications and supports marking read', async () => {
    testDb
      .prepare(
        `INSERT INTO notifications (notification_type, entity_type, entity_id, title, message, due_date, is_read)
         VALUES ('rent_due', 'contract', 1, 'Rent', 'msg', '2026-01-01', 0)`
      )
      .run()
    const list = (await invoke(registry, 'notifications:list', { unread_only: true })) as Array<{
      id: number
    }>
    expect(list.length).toBe(1)

    const marked = (await invoke(registry, 'notifications:markRead', list[0].id)) as {
      success: boolean
    }
    expect(marked.success).toBe(true)
    const after = (await invoke(registry, 'notifications:list', {
      unread_only: true
    })) as Array<unknown>
    expect(after.length).toBe(0)
  })
})

describe('exchangeRateIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerExchangeRateIpcHandlers()
  })

  it('lists seeded exchange rates', async () => {
    testDb
      .prepare(
        `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
         VALUES ('USD', 'JOD', 0.71, '2026-01-01', 'manual')`
      )
      .run()
    const rates = (await invoke(registry, 'exchangeRates:list')) as Array<{
      currency_from: string
      rate: number
    }>
    expect(rates.length).toBe(1)
    expect(rates[0].currency_from).toBe('USD')
  })

  it('adds a new rate', async () => {
    const res = (await invoke(registry, 'exchangeRates:add', {
      currency_from: 'USD',
      currency_to: 'JOD',
      rate: 0.71,
      effective_date: '2026-01-01',
      source: 'manual'
    })) as { id: number; upserted: boolean }
    expect(res.id).toBeGreaterThan(0)
    expect(res.upserted).toBe(false)
    const rate = testDb
      .prepare('SELECT rate FROM exchange_rates WHERE currency_from = ? AND currency_to = ?')
      .get('USD', 'JOD') as { rate: number }
    expect(rate.rate).toBe(0.71)
  })

  it('upserts when the same pair+date already exists', async () => {
    await invoke(registry, 'exchangeRates:add', {
      currency_from: 'USD',
      currency_to: 'JOD',
      rate: 0.71,
      effective_date: '2026-01-01',
      source: 'manual'
    })
    const res = (await invoke(registry, 'exchangeRates:add', {
      currency_from: 'USD',
      currency_to: 'JOD',
      rate: 0.8,
      effective_date: '2026-01-01',
      source: 'manual'
    })) as { upserted: boolean }
    expect(res.upserted).toBe(true)
    const count = testDb.prepare('SELECT COUNT(*) AS c FROM exchange_rates').get() as { c: number }
    expect(count.c).toBe(1)
    const rate = testDb
      .prepare('SELECT rate FROM exchange_rates WHERE currency_from = ? AND currency_to = ?')
      .get('USD', 'JOD') as { rate: number }
    expect(rate.rate).toBe(0.8)
  })

  it('returns the latest rate for a pair', async () => {
    testDb
      .prepare(
        `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
         VALUES ('USD', 'JOD', 0.71, '2026-01-01', 'manual')`
      )
      .run()
    testDb
      .prepare(
        `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
         VALUES ('USD', 'JOD', 0.72, '2026-03-01', 'manual')`
      )
      .run()
    const latest = (await invoke(registry, 'exchangeRates:latest', {
      currency_from: 'USD',
      currency_to: 'JOD'
    })) as { rate: number }
    expect(latest.rate).toBe(0.72)
  })
})

describe('searchIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerSearchIpcHandlers()
  })

  it('returns matching properties for a >=2 char query', async () => {
    seedProperty('Sunset Villa')
    const results = (await invoke(registry, 'search:global', 'Sunset')) as Array<{
      entity_type: string
    }>
    expect(results.length).toBe(1)
    expect(results[0].entity_type).toBe('property')
  })

  it('returns empty array for a <2 char query', async () => {
    seedProperty('Sunset Villa')
    const results = (await invoke(registry, 'search:global', 'S')) as Array<unknown>
    expect(results.length).toBe(0)
  })
})
