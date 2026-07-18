import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from '../migrations'
import {
  createPayment,
  voidPayment,
  listPayments,
  PaymentError,
  type CreatePaymentInput
} from '../paymentRepository'

/**
 * INTENT: Regression tests for the payment domain invariants: BR-13 (currency lock),
 *         BR-20 (immutability — void never deletes), and BR-21 (atomicity — payment + ledger
 *         succeed together or not at all). These are the highest-risk rules in the financial core.
 *
 * CONSTRAINT: Per AGENTS — bug-fix/critical code MUST include a regression test reproducing the
 *             failure. BR-21 atomicity is proven by deliberately breaking the ledger insert and
 *             asserting no payment row survives.
 */

describe('paymentRepository (BR-13/20/21)', () => {
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
          `INSERT INTO tenants (code, fullname, phone) VALUES ('T-1', 'Tenant One', '+962790000000')`
        )
        .run().lastInsertRowid
    )
    contractId = Number(
      db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency, status)
           VALUES ('C-1', ?, ?, '2026-01-01', '2026-12-31', 500, 'JOD', 'active')`
        )
        .run(propertyId, tenantId).lastInsertRowid
    )
  })

  function baseInput(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
    return {
      contract_id: contractId,
      property_id: propertyId,
      tenant_id: tenantId,
      payment_type: 'rent',
      payment_date: '2026-01-15',
      amount: 500,
      currency: 'JOD',
      property_currency: 'JOD',
      related_period_month: '2026-01',
      ...overrides
    }
  }

  describe('createPayment', () => {
    it('writes a payment row AND its income ledger row, returning both ids + receipt number', () => {
      const result = createPayment(db, baseInput())
      expect(result.payment_id).toBeGreaterThan(0)
      expect(result.ledger_id).toBeGreaterThan(0)
      expect(result.receipt_number).toMatch(/^RCT-\d{4}-\d{6}$/)

      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.payment_id)
      const ledger = db
        .prepare('SELECT * FROM ledger_entries WHERE reference_id = ? AND reference_type = ?')
        .get(result.payment_id, 'payment') as { entry_type: string; debit: number; credit: number }
      expect(payment).toBeDefined()
      expect(ledger.entry_type).toBe('income')
      expect(ledger.debit).toBe(500)
      expect(ledger.credit).toBe(0)
    })

    it('rejects a currency that differs from the property currency (BR-13)', () => {
      expect(() =>
        createPayment(db, baseInput({ currency: 'USD', property_currency: 'JOD' }))
      ).toThrow(PaymentError)
      // Nothing was written.
      expect((db.prepare('SELECT COUNT(*) AS n FROM payments').get() as { n: number }).n).toBe(0)
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }).n
      ).toBe(0)
    })

    it('rejects a non-positive amount', () => {
      expect(() => createPayment(db, baseInput({ amount: 0 }))).toThrow(PaymentError)
      expect(() => createPayment(db, baseInput({ amount: -5 }))).toThrow(PaymentError)
    })

    it('BR-21 atomicity: a ledger failure rolls back the payment insert too', () => {
      // Sabotage appendLedgerEntry by dropping the ledger table mid-flight is messy; instead we
      // wrap createPayment's transaction with a stubbed ledger that throws. The cleanest way to
      // force a failure AFTER the payment insert but INSIDE the transaction is to attach a trigger
      // that rejects the ledger insert. We create a BEFORE INSERT trigger on ledger_entries that
      // raises an abort for a sentinel description, then attempt a payment whose description is
      // irrelevant — instead we override appendLedgerEntry's path by making description too long
      // for the column is not possible (TEXT). So we use a trigger on a sentinel marker.
      db.exec(
        `CREATE TRIGGER block_ledger_for_test
         BEFORE INSERT ON ledger_entries
         WHEN NEW.description LIKE '%__BLOCK_FOR_TEST__%'
         BEGIN
           SELECT RAISE(ABORT, 'forced ledger failure');
         END;`
      )
      // Patch createPayment's ledger description by using a tenant whose name includes the sentinel.
      db.prepare(`UPDATE tenants SET fullname = ? WHERE id = ?`).run(
        'Tenant __BLOCK_FOR_TEST__',
        tenantId
      )

      expect(() => createPayment(db, baseInput())).toThrow()

      // BR-21: neither the payment nor the ledger row should exist.
      expect((db.prepare('SELECT COUNT(*) AS n FROM payments').get() as { n: number }).n).toBe(0)
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }).n
      ).toBe(0)
    })
  })

  describe('voidPayment (BR-20 immutability)', () => {
    it('flips is_voided, records the reason, and appends an income_void reversal ledger row', () => {
      const created = createPayment(db, baseInput())
      const ledgerCountBefore = (
        db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }
      ).n

      const voided = voidPayment(db, created.payment_id, 'bank reversal')
      expect(voided.ledger_id).toBeGreaterThan(0)

      const payment = db
        .prepare('SELECT is_voided, void_reason FROM payments WHERE id = ?')
        .get(created.payment_id) as { is_voided: number; void_reason: string }
      expect(payment.is_voided).toBe(1)
      expect(payment.void_reason).toBe('bank reversal')

      const reversal = db
        .prepare('SELECT * FROM ledger_entries WHERE id = ?')
        .get(voided.ledger_id) as {
        entry_type: string
        debit: number
        credit: number
        reference_id: number
      }
      expect(reversal.entry_type).toBe('income_void')
      expect(reversal.debit).toBe(0)
      expect(reversal.credit).toBe(500) // equal-and-opposite
      expect(reversal.reference_id).toBe(created.payment_id)

      // A NEW ledger row was appended; the original income row was untouched.
      const ledgerCountAfter = (
        db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }
      ).n
      expect(ledgerCountAfter).toBe(ledgerCountBefore + 1)
    })

    it('rejects voiding a non-existent payment', () => {
      expect(() => voidPayment(db, 99999, 'reason')).toThrow(PaymentError)
    })

    it('rejects voiding an already-voided payment', () => {
      const created = createPayment(db, baseInput())
      voidPayment(db, created.payment_id, 'first reason')
      expect(() => voidPayment(db, created.payment_id, 'second reason')).toThrow(PaymentError)
    })

    it('rejects an empty void reason', () => {
      const created = createPayment(db, baseInput())
      expect(() => voidPayment(db, created.payment_id, '   ')).toThrow(PaymentError)
    })

    it('net running balance is zero after voiding a single payment (BR-20/22 together)', () => {
      const created = createPayment(db, baseInput({ amount: 750 }))
      voidPayment(db, created.payment_id, 'test void')
      // Reconstruct from ledger: income(+750) + income_void(-750) = 0
      const rows = db
        .prepare('SELECT debit, credit FROM ledger_entries WHERE property_id = ? ORDER BY id')
        .all(propertyId) as { debit: number; credit: number }[]
      const net = rows.reduce((sum, r) => sum + r.debit - r.credit, 0)
      expect(net).toBe(0)
    })
  })

  describe('listPayments (read side)', () => {
    it('returns joined property/tenant/contract labels and respects filters', () => {
      createPayment(
        db,
        baseInput({ amount: 100, payment_date: '2026-01-15', related_period_month: '2026-01' })
      )
      createPayment(
        db,
        baseInput({ amount: 200, payment_date: '2026-02-15', related_period_month: '2026-02' })
      )

      const all = listPayments(db) as { amount: number }[]
      expect(all).toHaveLength(2)

      const filtered = listPayments(db, { from_date: '2026-02-01' }) as { amount: number }[]
      expect(filtered).toHaveLength(1)
      expect(filtered[0].amount).toBe(200)
    })

    it('isolates results per property', () => {
      const otherProperty = Number(
        db
          .prepare(
            `INSERT INTO properties (code, name, type, country, currency, monthly_rent_default)
             VALUES ('P-2', 'Other', 'apartment', 'TR', 'TRY', 5000)`
          )
          .run().lastInsertRowid
      )
      createPayment(db, baseInput({ amount: 100 }))
      createPayment(
        db,
        baseInput({
          amount: 200,
          property_id: otherProperty,
          currency: 'TRY',
          property_currency: 'TRY',
          tenant_id: null,
          contract_id: null
        })
      )

      expect((listPayments(db, { property_id: propertyId }) as unknown[]).length).toBe(1)
      expect((listPayments(db, { property_id: otherProperty }) as unknown[]).length).toBe(1)
    })
  })

  describe('BR-20 ledger immutability — the original income row is never mutated', () => {
    it('voiding a payment leaves the original income ledger row byte-identical', () => {
      const created = createPayment(db, baseInput({ amount: 600 }))
      const before = db
        .prepare(
          'SELECT id, entry_type, debit, credit, description FROM ledger_entries WHERE id = ?'
        )
        .get(created.ledger_id) as {
        id: number
        entry_type: string
        debit: number
        credit: number
        description: string
      }

      voidPayment(db, created.payment_id, 'audit correction')

      const after = db
        .prepare(
          'SELECT id, entry_type, debit, credit, description FROM ledger_entries WHERE id = ?'
        )
        .get(created.ledger_id) as {
        id: number
        entry_type: string
        debit: number
        credit: number
        description: string
      }

      expect(after).toEqual(before)
    })
  })
})
