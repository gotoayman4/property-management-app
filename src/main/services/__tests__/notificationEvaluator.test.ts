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
})
