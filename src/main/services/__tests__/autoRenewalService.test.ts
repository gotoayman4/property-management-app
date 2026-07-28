/**
 * @file autoRenewalService.test — tests for launch-time automatic contract renewal (FR-CON-04b).
 *
 * INTENT: Verify applyDueAutoRenewals renews due, opt-in, flat-mode contracts in place —
 *         preserving term length, applying the optional fixed increment, rolling a lapsed
 *         contract forward across terms, recording the audit trail (BR-07), emitting a
 *         non-silent notification, and skipping ineligible contracts. Idempotent on re-run.
 * CONSTRAINT: Each test uses a fresh in-memory DB to avoid state leakage.
 */
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from '../../db/migrations'
import { applyDueAutoRenewals } from '../autoRenewalService'

/** ISO date (YYYY-MM-DD) offset from today by whole days. */
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

/** ISO date offset from today by whole years. */
function isoYearsAgo(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().split('T')[0]
}

describe('autoRenewalService', () => {
  let db: Database.Database
  let propertyId: number
  let tenantSeq = 0

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    tenantSeq = 0

    const prop = db
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('P-1', 'Test Prop', 'apartment', 'JO', 'JOD', 'rented', 500)`
      )
      .run()
    propertyId = Number(prop.lastInsertRowid)
  })

  function createTenant(): number {
    tenantSeq++
    const t = db
      .prepare(
        `INSERT INTO tenants (code, fullname, phone, is_active)
         VALUES (?, 'Tenant', '0790000000', 1)`
      )
      .run(`T-${tenantSeq}`)
    return Number(t.lastInsertRowid)
  }

  function createContract(
    overrides: {
      status?: string
      is_archived?: number
      has_variable_escalation?: number
      auto_renew?: number
      auto_renew_increase_percent?: number | null
      rent_amount?: number
      start_date?: string
      end_date?: string
      contract_term_years?: number
    } = {}
  ): number {
    const tenantId = createTenant()
    const c = db
      .prepare(
        `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
           rent_amount, currency, payment_frequency, status, is_archived,
           has_variable_escalation, auto_renew, auto_renew_increase_percent, contract_term_years)
         VALUES (?, ?, ?, ?, ?, ?, 'JOD', 'monthly', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `C-${Date.now()}-${tenantSeq}`,
        propertyId,
        tenantId,
        overrides.start_date ?? isoYearsAgo(2),
        overrides.end_date ?? isoDaysAgo(1),
        overrides.rent_amount ?? 1000,
        overrides.status ?? 'active',
        overrides.is_archived ?? 0,
        overrides.has_variable_escalation ?? 0,
        overrides.auto_renew ?? 1,
        overrides.auto_renew_increase_percent ?? null,
        overrides.contract_term_years ?? 1
      )
    return Number(c.lastInsertRowid)
  }

  function getContract(id: number): {
    start_date: string
    end_date: string
    rent_amount: number
    status: string
  } {
    return db
      .prepare('SELECT start_date, end_date, rent_amount, status FROM contracts WHERE id = ?')
      .get(id) as { start_date: string; end_date: string; rent_amount: number; status: string }
  }

  it('renews a due opt-in flat contract in place with the same rent when no increment is set', () => {
    const oldEnd = isoDaysAgo(1)
    const id = createContract({ rent_amount: 1000, end_date: oldEnd, contract_term_years: 1 })

    const renewed = applyDueAutoRenewals(db)
    expect(renewed).toBe(1)

    const c = getContract(id)
    expect(c.rent_amount).toBe(1000) // unchanged (no percent)
    expect(c.start_date).toBe(oldEnd) // new term starts at the prior end
    expect(new Date(c.end_date).getTime()).toBeGreaterThan(new Date(oldEnd).getTime())
  })

  it('applies the fixed yearly increment (rounded to 2dp) when auto_renew_increase_percent is set', () => {
    const id = createContract({
      rent_amount: 1000,
      auto_renew_increase_percent: 7.5,
      end_date: isoDaysAgo(1),
      contract_term_years: 1
    })

    applyDueAutoRenewals(db)
    expect(getContract(id).rent_amount).toBe(1075)
  })

  it('preserves the term length (new end = new start + contract_term_years)', () => {
    const oldEnd = isoDaysAgo(1)
    const id = createContract({ end_date: oldEnd, contract_term_years: 2 })

    applyDueAutoRenewals(db)

    const c = getContract(id)
    const expectedEnd = new Date(oldEnd)
    expectedEnd.setFullYear(expectedEnd.getFullYear() + 2)
    expect(c.end_date).toBe(expectedEnd.toISOString().split('T')[0])
  })

  it('rolls a contract lapsed several terms forward until its end date is in the future', () => {
    const id = createContract({ end_date: isoYearsAgo(3), contract_term_years: 1 })

    const renewed = applyDueAutoRenewals(db)
    expect(renewed).toBe(1)

    const c = getContract(id)
    expect(new Date(c.end_date).getTime()).toBeGreaterThan(Date.now())

    // Multi-term catch-up produces one history row per rolled term.
    const history = db
      .prepare('SELECT COUNT(*) AS n FROM contract_history WHERE contract_id = ?')
      .get(id) as { n: number }
    expect(history.n).toBeGreaterThan(1)
  })

  it('records a contract_history snapshot with action_type=renewed and an auto-renewed note (BR-07)', () => {
    const id = createContract({
      rent_amount: 1000,
      end_date: isoDaysAgo(1),
      contract_term_years: 1
    })

    applyDueAutoRenewals(db)

    const history = db
      .prepare('SELECT * FROM contract_history WHERE contract_id = ?')
      .all(id) as Array<{
      action_type: string
      previous_values_json: string
      changed_by_note: string
    }>
    expect(history).toHaveLength(1)
    expect(history[0].action_type).toBe('renewed')
    expect(history[0].changed_by_note).toContain('auto-renewed')
    expect(JSON.parse(history[0].previous_values_json).rent_amount).toBe(1000)
  })

  it('emits a contract_auto_renewed notification so the renewal is never silent', () => {
    const id = createContract({ end_date: isoDaysAgo(1) })

    applyDueAutoRenewals(db)

    const notif = db
      .prepare(
        "SELECT * FROM notifications WHERE notification_type = 'contract_auto_renewed' AND entity_id = ?"
      )
      .get(id) as { entity_type: string; message: string } | undefined
    expect(notif).toBeDefined()
    expect(notif?.entity_type).toBe('contract')
  })

  it('skips variable-escalation, cancelled, archived, and opted-out contracts', () => {
    createContract({ has_variable_escalation: 1, auto_renew: 1 })
    createContract({ status: 'cancelled', auto_renew: 1 })
    createContract({ is_archived: 1, auto_renew: 1 })
    createContract({ auto_renew: 0 })

    expect(applyDueAutoRenewals(db)).toBe(0)
  })

  it('skips contracts whose end date is still in the future', () => {
    const id = createContract({ end_date: isoDaysAgo(-30) }) // 30 days from now
    expect(applyDueAutoRenewals(db)).toBe(0)
    expect(getContract(id).rent_amount).toBe(1000)
  })

  it('is idempotent — a second run renews nothing further', () => {
    createContract({ end_date: isoDaysAgo(1) })
    expect(applyDueAutoRenewals(db)).toBe(1)
    expect(applyDueAutoRenewals(db)).toBe(0)
  })

  it('returns 0 when no contracts exist', () => {
    expect(applyDueAutoRenewals(db)).toBe(0)
  })
})
