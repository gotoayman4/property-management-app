import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateDuesForContract } from '../../db/duesGeneration'
import { runMigrations } from '../../db/migrations'
import { evaluateNotifications } from '../notificationEvaluator'

describe('notificationEvaluator', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    db.prepare(
      "INSERT OR IGNORE INTO countries (code, name, default_currency, is_active) VALUES ('US', 'United States', 'USD', 1)"
    ).run()
  })

  afterEach(() => {
    db.close()
  })

  it('runs evaluateNotifications without throwing on empty database', () => {
    expect(() => evaluateNotifications(db)).not.toThrow()
  })

  it('inserts contract end notification when contract expiry is within reminder window', () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const todayMs = new Date(todayStr).getTime()
    const in3Days = new Date(todayMs + 3 * 86400000).toISOString().split('T')[0]
    const pastStart = new Date(todayMs - 100 * 86400000).toISOString().split('T')[0]

    db.prepare(
      "INSERT INTO properties (code, name, address, currency, type, country) VALUES ('P1', 'Property 1', 'Addr', 'USD', 'apartment', 'US')"
    ).run()
    db.prepare("INSERT INTO tenants (code, fullname, phone) VALUES ('T1', 'Tenant 1', '123')").run()
    db.prepare(
      `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency, status)
       VALUES ('C1', 1, 1, ?, ?, 1000, 'USD', 'active')`
    ).run(pastStart, in3Days)

    evaluateNotifications(db)

    const notifications = db
      .prepare("SELECT * FROM notifications WHERE notification_type = 'contract_expiry'")
      .all()
    expect(notifications.length).toBeGreaterThan(0)
  })

  it('fires dues-driven overdue notifications from rent_dues (not the end_date proxy)', () => {
    // A fully backdated contract: every generated due sits in the past, so each open period
    // must surface as an overdue notification sourced from rent_dues.
    const todayMs = Date.now()
    const start = new Date(todayMs - 200 * 86400000).toISOString().split('T')[0]
    const end = new Date(todayMs - 20 * 86400000).toISOString().split('T')[0]

    db.prepare(
      "INSERT INTO properties (code, name, address, currency, type, country) VALUES ('P2', 'Property 2', 'Addr', 'USD', 'apartment', 'US')"
    ).run()
    db.prepare("INSERT INTO tenants (code, fullname, phone) VALUES ('T2', 'Tenant 2', '456')").run()
    const contractId = Number(
      db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, status)
           VALUES ('C2', 1, 1, ?, ?, 1000, 'USD', 'monthly', 'active')`
        )
        .run(start, end).lastInsertRowid
    )
    generateDuesForContract(db, contractId)

    evaluateNotifications(db)

    const overdue = db
      .prepare("SELECT * FROM notifications WHERE notification_type = 'overdue' AND entity_id = ?")
      .all(contractId)
    expect(overdue.length).toBeGreaterThan(0)
  })

  // Helper: one active property+tenant+contract, dues generated, returns contract id.
  function seedContract(startISO: string, endISO: string, dueDay = 1): number {
    db.prepare(
      "INSERT INTO properties (code, name, address, currency, type, country) VALUES ('P9', 'Property 9', 'Addr', 'USD', 'apartment', 'US')"
    ).run()
    db.prepare("INSERT INTO tenants (code, fullname, phone) VALUES ('T9', 'Tenant 9', '789')").run()
    const contractId = Number(
      db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, payment_due_day, status)
           VALUES ('C9', 1, 1, ?, ?, 1000, 'USD', 'monthly', ?, 'active')`
        )
        .run(startISO, endISO, dueDay).lastInsertRowid
    )
    generateDuesForContract(db, contractId)
    return contractId
  }

  it('fires rent_due ONLY for a due dated today — never for upcoming dues', () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const todayMs = new Date(todayStr).getTime()
    const end = new Date(todayMs + 300 * 86400000).toISOString().split('T')[0]
    const contractId = seedContract(todayStr, end)

    evaluateNotifications(db)

    const rentDue = db
      .prepare(
        "SELECT due_date FROM notifications WHERE notification_type = 'rent_due' AND entity_id = ?"
      )
      .all(contractId) as Array<{ due_date: string }>
    // The contract starts today with payment_due_day=1 → first due is clamped to today; every
    // later period is in the future and must NOT produce a rent_due notification.
    expect(rentDue.length).toBe(1)
    expect(rentDue[0].due_date).toBe(todayStr)
  })

  it('replaces the unread rent_due with the overdue notification for the same period', () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const todayMs = new Date(todayStr).getTime()
    const start = new Date(todayMs - 40 * 86400000).toISOString().split('T')[0]
    const end = new Date(todayMs + 300 * 86400000).toISOString().split('T')[0]
    const contractId = seedContract(start, end)

    // Simulate a rent_due created back when the first period was due (still unread).
    const firstDue = db
      .prepare('SELECT due_date FROM rent_dues WHERE contract_id = ? ORDER BY due_date ASC LIMIT 1')
      .get(contractId) as { due_date: string }
    db.prepare(
      `INSERT INTO notifications (notification_type, entity_type, entity_id, title, message, due_date)
       VALUES ('rent_due', 'contract', ?, 'rent_due_title', 'msg', ?)`
    ).run(contractId, firstDue.due_date)

    evaluateNotifications(db)

    const perPeriod = db
      .prepare(
        `SELECT notification_type FROM notifications
         WHERE entity_id = ? AND due_date = ? AND notification_type IN ('rent_due', 'overdue')`
      )
      .all(contractId, firstDue.due_date) as Array<{ notification_type: string }>
    // ONE live notification per period: the stale rent_due is deleted, the overdue remains.
    expect(perPeriod.map((r) => r.notification_type)).toEqual(['overdue'])
  })

  it('keeps a single arrears_summary row across repeated evaluations (no daily clutter)', () => {
    const todayMs = Date.now()
    const start = new Date(todayMs - 200 * 86400000).toISOString().split('T')[0]
    const end = new Date(todayMs + 300 * 86400000).toISOString().split('T')[0]
    const contractId = seedContract(start, end)

    evaluateNotifications(db)
    evaluateNotifications(db)

    const summaries = db
      .prepare(
        "SELECT * FROM notifications WHERE notification_type = 'arrears_summary' AND entity_id = ?"
      )
      .all(contractId)
    expect(summaries.length).toBe(1)
  })
})
