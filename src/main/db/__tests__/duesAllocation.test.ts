import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { toLocalISODate } from '../../utils/dateUtils'
import {
  allocatePaymentToDues,
  reverseAllocations,
  settleDuesBeforeApp,
  waiveDue,
  getOutstandingDues,
  getArrearsSummary,
  type PaymentForAllocation
} from '../duesAllocation'
import { generateDuesForContract, createOpeningBalanceDue, DuesError } from '../duesGeneration'
import { runMigrations } from '../migrations'

/**
 * INTENT: Prove payments allocate to the correct dues (targeted period, partial, multi-month,
 *         FIFO spillover), that void reversal restores status exactly, and that the
 *         settle-before-app / waive migration transitions NEVER write to the immutable ledger.
 * CONSTRAINT: Per AGENTS — receivables must stay in sync with cash without polluting the
 *             cash-basis ledger; the no-ledger invariant is asserted explicitly.
 */

describe('duesAllocation', () => {
  let db: Database.Database
  let propertyId: number
  let tenantId: number
  let contractId: number

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
    contractId = Number(
      db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, status, has_variable_escalation)
           VALUES ('C-1', ?, ?, '2024-01-01', '2024-12-31', 500, 'JOD', 'monthly', 'active', 0)`
        )
        .run(propertyId, tenantId).lastInsertRowid
    )
    generateDuesForContract(db, contractId)
  })

  /** Insert a bare payment row (bypasses createPayment) and return its id for allocation tests. */
  function insertPayment(
    overrides: Partial<{ amount: number; related_period_month: string }> = {}
  ): number {
    const amount = overrides.amount ?? 500
    return Number(
      db
        .prepare(
          `INSERT INTO payments (contract_id, property_id, tenant_id, payment_type, payment_date,
             amount, currency, receipt_number, related_period_month)
           VALUES (?, ?, ?, 'rent', '2024-06-15', ?, 'JOD', 'RCT-2024-000001', ?)`
        )
        .run(contractId, propertyId, tenantId, amount, overrides.related_period_month ?? null)
        .lastInsertRowid
    )
  }

  function dueByPeriod(period: string): { amount_paid: number; status: string } {
    return db
      .prepare(`SELECT amount_paid, status FROM rent_dues WHERE contract_id = ? AND period_key = ?`)
      .get(contractId, period) as { amount_paid: number; status: string }
  }

  function ledgerCount(): number {
    return (db.prepare(`SELECT COUNT(*) AS n FROM ledger_entries`).get() as { n: number }).n
  }

  describe('allocatePaymentToDues', () => {
    it('exact payment to a targeted period marks it paid', () => {
      const pid = insertPayment({ amount: 500, related_period_month: '2024-03' })
      const payment: PaymentForAllocation = {
        payment_id: pid,
        contract_id: contractId,
        payment_type: 'rent',
        amount: 500,
        related_period_month: '2024-03'
      }
      allocatePaymentToDues(db, payment)
      const due = dueByPeriod('2024-03')
      expect(due.amount_paid).toBe(500)
      expect(due.status).toBe('paid')
    })

    it('partial payment marks the period partial', () => {
      const pid = insertPayment({ amount: 200, related_period_month: '2024-03' })
      allocatePaymentToDues(db, {
        payment_id: pid,
        contract_id: contractId,
        payment_type: 'rent',
        amount: 200,
        related_period_month: '2024-03'
      })
      const due = dueByPeriod('2024-03')
      expect(due.amount_paid).toBe(200)
      expect(due.status).toBe('partial')
    })

    it('multi-month payment splits across the labelled periods', () => {
      const pid = insertPayment({ amount: 1000, related_period_month: '2024-01,2024-02' })
      allocatePaymentToDues(db, {
        payment_id: pid,
        contract_id: contractId,
        payment_type: 'rent',
        amount: 1000,
        related_period_month: '2024-01,2024-02'
      })
      expect(dueByPeriod('2024-01').status).toBe('paid')
      expect(dueByPeriod('2024-02').status).toBe('paid')
    })

    it('unlabelled payment spills over FIFO to the oldest open dues', () => {
      const pid = insertPayment({ amount: 500 })
      allocatePaymentToDues(db, {
        payment_id: pid,
        contract_id: contractId,
        payment_type: 'rent',
        amount: 500,
        related_period_month: null
      })
      // Oldest period (Jan) consumes the full amount.
      expect(dueByPeriod('2024-01').status).toBe('paid')
      expect(dueByPeriod('2024-02').status).toBe('pending')
    })

    it('ignores non-rent payments and payments without a contract', () => {
      const pid = insertPayment({ amount: 500 })
      allocatePaymentToDues(db, {
        payment_id: pid,
        contract_id: contractId,
        payment_type: 'deposit',
        amount: 500
      })
      expect(dueByPeriod('2024-01').status).toBe('pending')

      allocatePaymentToDues(db, {
        payment_id: pid,
        contract_id: null,
        payment_type: 'rent',
        amount: 500
      })
      expect(dueByPeriod('2024-01').status).toBe('pending')
    })
  })

  describe('reverseAllocations', () => {
    it('restores due status exactly after a void', () => {
      const pid = insertPayment({ amount: 500, related_period_month: '2024-03' })
      const payment: PaymentForAllocation = {
        payment_id: pid,
        contract_id: contractId,
        payment_type: 'rent',
        amount: 500,
        related_period_month: '2024-03'
      }
      allocatePaymentToDues(db, payment)
      expect(dueByPeriod('2024-03').status).toBe('paid')

      reverseAllocations(db, pid)
      const due = dueByPeriod('2024-03')
      expect(due.amount_paid).toBe(0)
      expect(due.status).toBe('pending')
      // Allocation rows are removed.
      const allocN = (
        db
          .prepare(`SELECT COUNT(*) AS n FROM due_payment_allocations WHERE payment_id = ?`)
          .get(pid) as { n: number }
      ).n
      expect(allocN).toBe(0)
    })

    it('reversing a partial restores partial→pending', () => {
      const pid = insertPayment({ amount: 200, related_period_month: '2024-03' })
      allocatePaymentToDues(db, {
        payment_id: pid,
        contract_id: contractId,
        payment_type: 'rent',
        amount: 200,
        related_period_month: '2024-03'
      })
      reverseAllocations(db, pid)
      expect(dueByPeriod('2024-03').status).toBe('pending')
    })
  })

  describe('settleDuesBeforeApp / waiveDue (no ledger writes)', () => {
    it('settle marks open dues settled_before_app and writes NO ledger row', () => {
      const before = ledgerCount()
      const ids = (
        db
          .prepare(`SELECT id FROM rent_dues WHERE contract_id = ? ORDER BY due_date ASC LIMIT 3`)
          .all(contractId) as Array<{ id: number }>
      ).map((r) => r.id)

      const changed = settleDuesBeforeApp(db, ids, 'collected before adoption')
      expect(changed).toBe(3)
      const settled = db
        .prepare(`SELECT COUNT(*) AS n FROM rent_dues WHERE status = 'settled_before_app'`)
        .get() as { n: number }
      expect(settled.n).toBe(3)
      expect(ledgerCount()).toBe(before) // ledger untouched
    })

    it('settle requires a non-empty note', () => {
      const ids = (db.prepare(`SELECT id FROM rent_dues LIMIT 1`).get() as { id: number }).id
      expect(() => settleDuesBeforeApp(db, [ids], '   ')).toThrow(DuesError)
    })

    it('waive marks a due waived and writes NO ledger row', () => {
      const before = ledgerCount()
      const id = (db.prepare(`SELECT id FROM rent_dues LIMIT 1`).get() as { id: number }).id
      const changed = waiveDue(db, id, 'goodwill')
      expect(changed).toBe(1)
      const row = db.prepare(`SELECT status FROM rent_dues WHERE id = ?`).get(id) as {
        status: string
      }
      expect(row.status).toBe('waived')
      expect(ledgerCount()).toBe(before)
    })

    it('waive requires a reason', () => {
      const id = (db.prepare(`SELECT id FROM rent_dues LIMIT 1`).get() as { id: number }).id
      expect(() => waiveDue(db, id, '')).toThrow('DUE_NOTE_REQUIRED')
    })
  })

  describe('queries', () => {
    it('getOutstandingDues lists open dues; only_overdue restricts to past due_dates', () => {
      const all = getOutstandingDues(db, { contract_id: contractId })
      expect(all.length).toBe(12)
      const overdue = getOutstandingDues(db, { contract_id: contractId, only_overdue: true })
      // The 2024 contract is fully in the past — all 12 periods are overdue.
      expect(overdue.length).toBe(12)
    })

    it('only_overdue INCLUDES a due dated exactly today (due today or overdue semantics)', () => {
      // Regression: an opening balance dated today must appear in the "due now" list —
      // only_overdue means due_date <= today, not strictly past.
      const today = toLocalISODate(new Date())
      createOpeningBalanceDue(db, { contract_id: contractId, amount: 750, as_of_date: today })
      const rows = getOutstandingDues(db, {
        contract_id: contractId,
        only_overdue: true
      }) as Array<{ due_type: string; due_date: string }>
      const opening = rows.find((r) => r.due_type === 'opening_balance')
      expect(opening).toBeDefined()
      expect(opening?.due_date).toBe(today)
    })

    it('getArrearsSummary aggregates outstanding per currency including opening balance', () => {
      createOpeningBalanceDue(db, {
        contract_id: contractId,
        amount: 1000,
        as_of_date: '2023-01-01'
      })
      const summary = getArrearsSummary(db) as Array<{
        currency: string
        total_outstanding: number
      }>
      const jod = summary.find((s) => s.currency === 'JOD')
      expect(jod).toBeDefined()
      // 12 * 500 rent + 1000 opening balance = 7000 outstanding.
      expect(jod?.total_outstanding).toBe(7000)
    })

    it('getArrearsSummary counts a due dated TODAY (0-30 bucket, not excluded)', () => {
      // Regression: the boundary must be <= today, so a just-added opening balance dated
      // today shows in the summary immediately instead of only from tomorrow.
      const today = new Date().toISOString().split('T')[0]
      createOpeningBalanceDue(db, {
        contract_id: contractId,
        amount: 250,
        as_of_date: today
      })
      const summary = getArrearsSummary(db) as Array<{
        currency: string
        total_outstanding: number
        bucket_0_30: number
      }>
      const jod = summary.find((s) => s.currency === 'JOD')
      // 12 * 500 past-due rent + 250 today-dated opening balance.
      expect(jod?.total_outstanding).toBe(6250)
      expect(jod?.bucket_0_30).toBeGreaterThanOrEqual(250)
    })
  })
})
