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

  // -----------------------------------------------------------------------
  // Exchange-rate snapshot — the core regression this migration exists to prevent
  // -----------------------------------------------------------------------

  describe('exchange-rate snapshot (frozen at write time)', () => {
    /** Adds an exchange rate pair before creating a payment. */
    function addRate(from: string, to: string, rate: number, date = '2026-07-01'): void {
      db.prepare(
        `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
         VALUES (?, ?, ?, ?, 'manual')`
      ).run(from, to, rate, date)
    }

    it('stores reporting_currency, exchange_rate, and base_amount on the payment row at write time', () => {
      // Change reporting currency to USD, add JOD→USD rate, then create a JOD payment.
      db.prepare("UPDATE settings SET reporting_currency = 'USD' WHERE id = 1").run()
      addRate('JOD', 'USD', 0.71)

      const created = createPayment(db, baseInput({ amount: 100 }))
      const payment = db
        .prepare('SELECT reporting_currency, exchange_rate, base_amount FROM payments WHERE id = ?')
        .get(created.payment_id) as {
        reporting_currency: string | null
        exchange_rate: number | null
        base_amount: number | null
      }

      expect(payment.reporting_currency).toBe('USD')
      expect(payment.exchange_rate).toBeCloseTo(0.71)
      expect(payment.base_amount).toBeCloseTo(71)
    })

    it('stores exchange_rate = 1 when property currency equals reporting currency', () => {
      // Default reporting currency is JOD; property currency is JOD.
      const created = createPayment(db, baseInput({ amount: 250 }))
      const payment = db
        .prepare('SELECT reporting_currency, exchange_rate, base_amount FROM payments WHERE id = ?')
        .get(created.payment_id) as {
        reporting_currency: string | null
        exchange_rate: number | null
        base_amount: number | null
      }

      expect(payment.reporting_currency).toBe('JOD')
      expect(payment.exchange_rate).toBe(1)
      expect(payment.base_amount).toBe(250)
    })

    it('stores NULL for all three columns when no rate exists', () => {
      // No exchange rate rows and reporting currency differs.
      db.prepare("UPDATE settings SET reporting_currency = 'EUR' WHERE id = 1").run()
      const created = createPayment(db, baseInput({ amount: 150 }))
      const payment = db
        .prepare('SELECT reporting_currency, exchange_rate, base_amount FROM payments WHERE id = ?')
        .get(created.payment_id) as {
        reporting_currency: string | null
        exchange_rate: number | null
        base_amount: number | null
      }

      expect(payment.reporting_currency).toBeNull()
      expect(payment.exchange_rate).toBeNull()
      expect(payment.base_amount).toBeNull()
    })

    it('mirrors the snapshot onto the ledger row (income)', () => {
      db.prepare("UPDATE settings SET reporting_currency = 'USD' WHERE id = 1").run()
      addRate('JOD', 'USD', 0.71)

      const created = createPayment(db, baseInput({ amount: 100 }))
      const ledgerRow = db
        .prepare(
          'SELECT reporting_currency, exchange_rate, base_amount FROM ledger_entries WHERE id = ?'
        )
        .get(created.ledger_id) as {
        reporting_currency: string | null
        exchange_rate: number | null
        base_amount: number | null
      }

      expect(ledgerRow.reporting_currency).toBe('USD')
      expect(ledgerRow.exchange_rate).toBeCloseTo(0.71)
      expect(ledgerRow.base_amount).toBeCloseTo(71)
    })

    it('remains frozen — adding a later rate does NOT change the stored snapshot', () => {
      db.prepare("UPDATE settings SET reporting_currency = 'USD' WHERE id = 1").run()
      // Rate at write time = 0.70. Later, a newer rate appears at 0.72.
      addRate('JOD', 'USD', 0.7, '2026-05-01')

      const created = createPayment(db, baseInput({ amount: 100 }))

      addRate('JOD', 'USD', 0.72, '2026-07-01') // newer date, higher rate

      const payment = db
        .prepare('SELECT base_amount FROM payments WHERE id = ?')
        .get(created.payment_id) as { base_amount: number }

      // Must still be 70, not 72 — the rate is frozen at write time.
      expect(payment.base_amount).toBeCloseTo(70)
    })
  })

  describe('void reconciliation — reversal uses exactly the original snapshot', () => {
    it('the income_void reversal carries the same reporting_currency and exchange_rate but negated base_amount', () => {
      db.prepare("UPDATE settings SET reporting_currency = 'USD' WHERE id = 1").run()
      db.prepare(
        `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
         VALUES ('JOD', 'USD', 0.70, '2026-06-01', 'manual')`
      ).run()

      const created = createPayment(db, baseInput({ amount: 200 }))
      const voided = voidPayment(db, created.payment_id, 'recon test')

      const reversal = db
        .prepare(
          'SELECT entry_type, reporting_currency, exchange_rate, base_amount FROM ledger_entries WHERE id = ?'
        )
        .get(voided.ledger_id) as {
        entry_type: string
        reporting_currency: string | null
        exchange_rate: number | null
        base_amount: number | null
      }

      expect(reversal.entry_type).toBe('income_void')
      expect(reversal.reporting_currency).toBe('USD')
      expect(reversal.exchange_rate).toBeCloseTo(0.7)
      // Negated: original income at +140, void at -140.
      expect(reversal.base_amount).toBeCloseTo(-140)
    })

    it('summing base_amount across income + void nets to zero', () => {
      db.prepare("UPDATE settings SET reporting_currency = 'USD' WHERE id = 1").run()
      db.prepare(
        `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
         VALUES ('JOD', 'USD', 0.50, '2026-06-01', 'manual')`
      ).run()

      const created = createPayment(db, baseInput({ amount: 100 }))
      voidPayment(db, created.payment_id, 'zero check')

      const rows = db
        .prepare(
          `SELECT COALESCE(SUM(base_amount), 0) AS consolidated
           FROM ledger_entries WHERE property_id = ?`
        )
        .get(propertyId) as { consolidated: number }

      expect(rows.consolidated).toBeCloseTo(0)
    })
  })
})
