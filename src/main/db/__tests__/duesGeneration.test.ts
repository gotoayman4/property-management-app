import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  monthsPerPeriod,
  computePeriods,
  dueDateForPeriod,
  generateDuesForContract,
  regenerateFutureDues,
  createOpeningBalanceDue,
  updateOpeningBalanceDue,
  deleteOpeningBalanceDue,
  DuesError
} from '../duesGeneration'
import { runMigrations } from '../migrations'

/**
 * INTENT: Prove the dues-generation engine derives the correct billing periods for every
 *         frequency, honours variable escalation, materializes a backdated contract's full
 *         history, stays idempotent, and only rewrites FUTURE pending rows on regeneration.
 * CONSTRAINT: Per AGENTS — period math is a normalization function and requires exhaustive,
 *             parameterized coverage; DB effects verified against an in-memory schema.
 */

/** Build a ContractForDues-compatible object literal for the pure period tests. */
function contract(overrides: Record<string, unknown> = {}): Parameters<typeof computePeriods>[0] {
  return {
    id: 1,
    property_id: 1,
    tenant_id: 1,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    rent_amount: 500,
    currency: 'JOD',
    payment_frequency: 'monthly',
    has_variable_escalation: 0,
    ...overrides
  } as Parameters<typeof computePeriods>[0]
}

describe('monthsPerPeriod', () => {
  it('maps every supported frequency to its month span', () => {
    expect(monthsPerPeriod('monthly')).toBe(1)
    expect(monthsPerPeriod('quarterly')).toBe(3)
    expect(monthsPerPeriod('every_4_months')).toBe(4)
    expect(monthsPerPeriod('semi_annual')).toBe(6)
    expect(monthsPerPeriod('semi-annual')).toBe(6)
    expect(monthsPerPeriod('annual')).toBe(12)
  })

  it('falls back to monthly for an unknown frequency', () => {
    expect(monthsPerPeriod('weekly')).toBe(1)
  })
})

describe('computePeriods (per frequency)', () => {
  it('monthly: 12 periods for a full calendar-year contract', () => {
    const periods = computePeriods(contract({ payment_frequency: 'monthly' }))
    expect(periods).toHaveLength(12)
    expect(periods[0].period_key).toBe('2026-01')
    expect(periods[0].period_start).toBe('2026-01-01')
    expect(periods[0].period_end).toBe('2026-01-31')
    expect(periods[0].due_date).toBe('2026-01-01')
    expect(periods[11].period_key).toBe('2026-12')
    expect(periods[11].period_end).toBe('2026-12-31')
  })

  it('quarterly: 4 periods spanning 3 months each', () => {
    const periods = computePeriods(contract({ payment_frequency: 'quarterly' }))
    expect(periods).toHaveLength(4)
    expect(periods[0].period_start).toBe('2026-01-01')
    expect(periods[0].period_end).toBe('2026-03-31')
    expect(periods[3].period_start).toBe('2026-10-01')
  })

  it('semi_annual: 2 periods spanning 6 months each', () => {
    const periods = computePeriods(contract({ payment_frequency: 'semi_annual' }))
    expect(periods).toHaveLength(2)
    expect(periods[0].period_end).toBe('2026-06-30')
    expect(periods[1].period_start).toBe('2026-07-01')
  })

  it('every_4_months: 3 periods spanning 4 months each', () => {
    const periods = computePeriods(contract({ payment_frequency: 'every_4_months' }))
    expect(periods).toHaveLength(3)
    expect(periods[0].period_start).toBe('2026-01-01')
    expect(periods[0].period_end).toBe('2026-04-30')
    expect(periods[0].due_date).toBe('2026-01-01')
    expect(periods[1].period_start).toBe('2026-05-01')
    expect(periods[1].period_end).toBe('2026-08-31')
    expect(periods[2].period_start).toBe('2026-09-01')
    expect(periods[2].period_end).toBe('2026-12-31')
  })

  it('annual: a single period spanning the whole year', () => {
    const periods = computePeriods(contract({ payment_frequency: 'annual' }))
    expect(periods).toHaveLength(1)
    expect(periods[0].period_start).toBe('2026-01-01')
    expect(periods[0].period_end).toBe('2026-12-31')
  })

  it('caps the final period_end at the contract end_date', () => {
    // 18-month monthly contract — last period_end must equal the contract end, not overflow.
    const periods = computePeriods(
      contract({ start_date: '2026-01-01', end_date: '2027-06-30', payment_frequency: 'monthly' })
    )
    expect(periods).toHaveLength(18)
    expect(periods[17].period_end).toBe('2027-06-30')
  })

  it('applies the contract payment_due_day to every period due_date', () => {
    const periods = computePeriods(contract({ payment_due_day: 15 }))
    expect(periods[0].due_date).toBe('2026-01-15')
    expect(periods[1].due_date).toBe('2026-02-15')
    expect(periods[11].due_date).toBe('2026-12-15')
  })

  it('never sets a due_date earlier than the period start for mid-month contracts', () => {
    // Contract starts on the 20th with due day 1 — periods run anniversary-to-anniversary
    // (20th→19th), so "day 1" falls before each period begins and every due clamps to the
    // period start instead of dating the debt before the period's tenancy.
    const periods = computePeriods(
      contract({ start_date: '2026-01-20', end_date: '2026-12-31', payment_due_day: 1 })
    )
    expect(periods[0].period_start).toBe('2026-01-20')
    expect(periods[0].due_date).toBe('2026-01-20')
    expect(periods[1].period_start).toBe('2026-02-20')
    expect(periods[1].due_date).toBe('2026-02-20')
  })
})

describe('dueDateForPeriod', () => {
  it.each([
    ['2026-01-01', 1, '2026-01-01'], // start of month (default)
    ['2026-01-01', 15, '2026-01-15'], // mid-month
    ['2026-01-01', 31, '2026-01-31'], // end of month
    ['2026-02-01', 31, '2026-02-28'], // 31 clamps to Feb 28 (non-leap)
    ['2024-02-01', 31, '2024-02-29'], // 31 clamps to Feb 29 (leap year)
    ['2026-04-01', 31, '2026-04-30'], // 31 clamps to 30-day month
    ['2026-01-20', 1, '2026-01-20'], // never before the period start
    ['2026-01-01', 0, '2026-01-01'], // invalid low input clamps to 1
    ['2026-01-01', 99, '2026-01-31'] // invalid high input clamps to 31
  ])('period %s + due day %i → %s', (periodStart, dueDay, expected) => {
    expect(dueDateForPeriod(periodStart, dueDay)).toBe(expected)
  })
})

describe('generateDuesForContract (DB effects)', () => {
  let db: Database.Database
  let propertyId: number
  let tenantId: number

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    propertyId = Number(
      db
        .prepare(
          `INSERT INTO properties (code, name, type, country, currency, monthly_rent_default)
           VALUES ('P-1', 'Test', 'apartment', 'JO', 'JOD', 500)`
        )
        .run().lastInsertRowid
    )
    tenantId = Number(
      db
        .prepare(
          `INSERT INTO tenants (code, fullname, phone) VALUES ('T-1', 'One', '+962790000000')`
        )
        .run().lastInsertRowid
    )
  })

  function seedContract(overrides: Record<string, string | number> = {}): number {
    const v = {
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_amount: 500,
      payment_frequency: 'monthly',
      has_variable_escalation: 0,
      ...overrides
    }
    return Number(
      db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, status, has_variable_escalation)
           VALUES ('C-1', ?, ?, ?, ?, ?, 'JOD', ?, 'active', ?)`
        )
        .run(
          propertyId,
          tenantId,
          v.start_date,
          v.end_date,
          v.rent_amount,
          v.payment_frequency,
          v.has_variable_escalation
        ).lastInsertRowid
    )
  }

  function dueCount(contractId: number): number {
    return (
      db.prepare(`SELECT COUNT(*) AS n FROM rent_dues WHERE contract_id = ?`).get(contractId) as {
        n: number
      }
    ).n
  }

  it('materializes a full flat-rent schedule at the contract amount', () => {
    const cId = seedContract()
    const inserted = generateDuesForContract(db, cId)
    expect(inserted).toBe(12)
    expect(dueCount(cId)).toBe(12)
    const amounts = db
      .prepare(`SELECT DISTINCT amount_due FROM rent_dues WHERE contract_id = ?`)
      .all(cId) as Array<{ amount_due: number }>
    expect(amounts).toEqual([{ amount_due: 500 }])
  })

  it('is idempotent — re-running inserts nothing new', () => {
    const cId = seedContract()
    expect(generateDuesForContract(db, cId)).toBe(12)
    expect(generateDuesForContract(db, cId)).toBe(0)
    expect(dueCount(cId)).toBe(12)
  })

  it('every_4_months contract passes the DB CHECK and yields 3 dues per year', () => {
    // Regression for migration 035 — the rebuilt contracts table must accept the new value.
    const cId = seedContract({ payment_frequency: 'every_4_months' })
    expect(generateDuesForContract(db, cId)).toBe(3)
    const dues = db
      .prepare(`SELECT due_date FROM rent_dues WHERE contract_id = ? ORDER BY due_date`)
      .all(cId) as Array<{ due_date: string }>
    expect(dues.map((d) => d.due_date)).toEqual(['2026-01-01', '2026-05-01', '2026-09-01'])
  })

  it('backdated contract materializes its full historical schedule', () => {
    const cId = seedContract({ start_date: '2024-01-01', end_date: '2024-12-31' })
    expect(generateDuesForContract(db, cId)).toBe(12)
    // All periods are in the past — every one is a candidate arrears row.
    const oldest = db
      .prepare(`SELECT MIN(due_date) AS d FROM rent_dues WHERE contract_id = ?`)
      .get(cId) as { d: string }
    expect(oldest.d).toBe('2024-01-01')
  })

  it('applies escalation-aware amounts per period', () => {
    const cId = seedContract({
      start_date: '2026-01-01',
      end_date: '2027-12-31',
      has_variable_escalation: 1
    })
    db.prepare(
      `INSERT INTO rent_escalation_schedule (contract_id, year_number, effective_start_date, rent_amount)
       VALUES (?, 1, '2026-01-01', 500)`
    ).run(cId)
    db.prepare(
      `INSERT INTO rent_escalation_schedule (contract_id, year_number, effective_start_date, rent_amount)
       VALUES (?, 2, '2027-01-01', 550)`
    ).run(cId)

    generateDuesForContract(db, cId)
    const jan26 = db
      .prepare(`SELECT amount_due FROM rent_dues WHERE contract_id = ? AND period_key = '2026-06'`)
      .get(cId) as { amount_due: number }
    const jan27 = db
      .prepare(`SELECT amount_due FROM rent_dues WHERE contract_id = ? AND period_key = '2027-06'`)
      .get(cId) as { amount_due: number }
    expect(jan26.amount_due).toBe(500)
    expect(jan27.amount_due).toBe(550)
  })

  it('returns 0 for a non-existent contract', () => {
    expect(generateDuesForContract(db, 9999)).toBe(0)
  })

  describe('regenerateFutureDues', () => {
    it('rewrites only FUTURE pending rows, preserving past and paid rows', () => {
      // Contract from 1 year ago to 1 year ahead so it straddles today.
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      const end = new Date()
      end.setFullYear(end.getFullYear() + 1)
      const iso = (d: Date): string => d.toISOString().split('T')[0]
      const cId = seedContract({ start_date: iso(start), end_date: iso(end) })
      generateDuesForContract(db, cId)

      // Mark the oldest (past) row as paid so it must survive regeneration untouched.
      const oldest = db
        .prepare(`SELECT id FROM rent_dues WHERE contract_id = ? ORDER BY due_date ASC LIMIT 1`)
        .get(cId) as { id: number }
      db.prepare(`UPDATE rent_dues SET status = 'paid', amount_paid = 500 WHERE id = ?`).run(
        oldest.id
      )

      // Bump the contract rent, then regenerate.
      db.prepare(`UPDATE contracts SET rent_amount = 600 WHERE id = ?`).run(cId)
      regenerateFutureDues(db, cId)

      // Paid past row keeps its original amount.
      const paid = db
        .prepare(`SELECT amount_due, status FROM rent_dues WHERE id = ?`)
        .get(oldest.id) as { amount_due: number; status: string }
      expect(paid.status).toBe('paid')
      expect(paid.amount_due).toBe(500)

      // A future pending row reflects the new amount.
      const today = iso(new Date())
      const future = db
        .prepare(
          `SELECT amount_due FROM rent_dues WHERE contract_id = ? AND period_start > ? AND status = 'pending' ORDER BY due_date DESC LIMIT 1`
        )
        .get(cId, today) as { amount_due: number }
      expect(future.amount_due).toBe(600)
    })
  })

  describe('createOpeningBalanceDue', () => {
    it('creates a single opening_balance row with the given amount', () => {
      const cId = seedContract()
      const { due_id } = createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 1234.5,
        as_of_date: '2026-01-01',
        note: 'migrated arrears'
      })
      const row = db.prepare(`SELECT * FROM rent_dues WHERE id = ?`).get(due_id) as {
        due_type: string
        amount_due: number
        status: string
        status_reason: string
      }
      expect(row.due_type).toBe('opening_balance')
      expect(row.amount_due).toBe(1234.5)
      expect(row.status).toBe('pending')
      expect(row.status_reason).toBe('migrated arrears')
    })

    it('throws DUE_AMOUNT_INVALID on a non-positive amount', () => {
      const cId = seedContract()
      expect(() =>
        createOpeningBalanceDue(db, { contract_id: cId, amount: 0, as_of_date: '2026-01-01' })
      ).toThrow(DuesError)
    })

    it('throws CONTRACT_NOT_FOUND for an unknown contract', () => {
      expect(() =>
        createOpeningBalanceDue(db, { contract_id: 9999, amount: 100, as_of_date: '2026-01-01' })
      ).toThrow('CONTRACT_NOT_FOUND')
    })

    // REGRESSION: a second add for the same contract previously hit SQLite's generic UNIQUE
    // constraint error (UNIQUE(contract_id, due_type, period_key)) and surfaced as an opaque
    // "An error occurred" to the user. It must now throw a specific, actionable DuesError code.
    it('throws OPENING_BALANCE_ALREADY_EXISTS on a second add for the same contract', () => {
      const cId = seedContract()
      createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 100,
        as_of_date: '2026-01-01'
      })
      expect(() =>
        createOpeningBalanceDue(db, {
          contract_id: cId,
          amount: 200,
          as_of_date: '2026-02-01'
        })
      ).toThrow('OPENING_BALANCE_ALREADY_EXISTS')
    })
  })

  describe('updateOpeningBalanceDue', () => {
    it('updates amount/date/note on a never-collected opening balance', () => {
      const cId = seedContract()
      const { due_id } = createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 100,
        as_of_date: '2026-01-01',
        note: 'old note'
      })
      const { changed } = updateOpeningBalanceDue(db, {
        due_id,
        amount: 250,
        as_of_date: '2026-03-15',
        note: 'corrected amount'
      })
      expect(changed).toBe(1)
      const row = db.prepare(`SELECT * FROM rent_dues WHERE id = ?`).get(due_id) as {
        amount_due: number
        due_date: string
        period_start: string
        status_reason: string
      }
      expect(row.amount_due).toBe(250)
      expect(row.due_date).toBe('2026-03-15')
      expect(row.period_start).toBe('2026-03-15')
      expect(row.status_reason).toBe('corrected amount')
    })

    it('throws DUE_AMOUNT_INVALID on a non-positive amount', () => {
      const cId = seedContract()
      const { due_id } = createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 100,
        as_of_date: '2026-01-01'
      })
      expect(() =>
        updateOpeningBalanceDue(db, { due_id, amount: 0, as_of_date: '2026-01-01' })
      ).toThrow(DuesError)
    })

    it('throws OPENING_BALANCE_NOT_EDITABLE once a payment is applied (amount_paid > 0)', () => {
      const cId = seedContract()
      const { due_id } = createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 100,
        as_of_date: '2026-01-01'
      })
      // Simulate a payment allocation — the due is no longer editable.
      db.prepare(`UPDATE rent_dues SET amount_paid = 40, status = 'partial' WHERE id = ?`).run(
        due_id
      )
      expect(() =>
        updateOpeningBalanceDue(db, { due_id, amount: 200, as_of_date: '2026-01-01' })
      ).toThrow('OPENING_BALANCE_NOT_EDITABLE')
    })

    it('throws OPENING_BALANCE_NOT_EDITABLE for a non-existent id', () => {
      expect(() =>
        updateOpeningBalanceDue(db, { due_id: 9999, amount: 200, as_of_date: '2026-01-01' })
      ).toThrow('OPENING_BALANCE_NOT_EDITABLE')
    })
  })

  describe('deleteOpeningBalanceDue', () => {
    it('hard-deletes a never-collected opening balance', () => {
      const cId = seedContract()
      const { due_id } = createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 100,
        as_of_date: '2026-01-01'
      })
      const { deleted } = deleteOpeningBalanceDue(db, due_id)
      expect(deleted).toBe(true)
      const row = db.prepare(`SELECT COUNT(*) AS n FROM rent_dues WHERE id = ?`).get(due_id) as {
        n: number
      }
      expect(row.n).toBe(0)
    })

    it('throws OPENING_BALANCE_NOT_DELETABLE once a payment is applied (amount_paid > 0)', () => {
      const cId = seedContract()
      const { due_id } = createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 100,
        as_of_date: '2026-01-01'
      })
      db.prepare(`UPDATE rent_dues SET amount_paid = 40, status = 'partial' WHERE id = ?`).run(
        due_id
      )
      expect(() => deleteOpeningBalanceDue(db, due_id)).toThrow('OPENING_BALANCE_NOT_DELETABLE')
    })

    it('throws OPENING_BALANCE_NOT_DELETABLE once the status moves off pending', () => {
      const cId = seedContract()
      const { due_id } = createOpeningBalanceDue(db, {
        contract_id: cId,
        amount: 100,
        as_of_date: '2026-01-01'
      })
      // Waiving a never-collected opening balance moves it to a terminal status — not deletable.
      db.prepare(`UPDATE rent_dues SET status = 'waived' WHERE id = ?`).run(due_id)
      expect(() => deleteOpeningBalanceDue(db, due_id)).toThrow('OPENING_BALANCE_NOT_DELETABLE')
    })

    it('throws OPENING_BALANCE_NOT_DELETABLE for a non-existent id', () => {
      expect(() => deleteOpeningBalanceDue(db, 9999)).toThrow('OPENING_BALANCE_NOT_DELETABLE')
    })
  })
})
