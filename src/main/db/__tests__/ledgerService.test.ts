import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  appendLedgerEntry,
  computeRunningBalances,
  reconstructBalanceAsOf,
  computeSummary,
  generateReceiptNumber,
  LedgerError,
  type LedgerEntryInput
} from '../ledgerService'
import { runMigrations } from '../migrations'

/**
 * INTENT: Exhaustively verify the immutable-ledger invariants (BR-20/22) and the receipt-number
 *         sequencing rule (BR-10). Per AGENTS, normalization/financial helpers require exhaustive
 *         parameterized tests.
 * CONSTRAINT: Each test runs against a fresh in-memory DB so order/state never leaks between cases.
 */

describe('ledgerService', () => {
  let db: Database.Database
  let propertyId: number

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    const info = db
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, monthly_rent_default)
         VALUES ('P-1', 'Test Property', 'apartment', 'JO', 'JOD', 500)`
      )
      .run()
    propertyId = Number(info.lastInsertRowid)
  })

  /** Convenience helper: append a row in a one-shot transaction. */
  function append(
    input: Omit<LedgerEntryInput, 'propertyId' | 'currency'> & {
      propertyId?: number
      currency?: string
    }
  ): number {
    return db.transaction(() => {
      return appendLedgerEntry(db, {
        entryDate: input.entryDate,
        entryType: input.entryType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        propertyId: input.propertyId ?? propertyId,
        description: input.description,
        debit: input.debit,
        credit: input.credit,
        currency: input.currency ?? 'JOD',
        isManualAdjustment: input.isManualAdjustment
      })
    })()
  }

  describe('appendLedgerEntry (BR-20 immutability & validation)', () => {
    it('inserts a row and returns its id', () => {
      const id = append({
        entryDate: '2026-01-01',
        entryType: 'income',
        description: 'Rent payment',
        debit: 500
      })
      expect(id).toBeGreaterThan(0)
      const row = db.prepare('SELECT * FROM ledger_entries WHERE id = ?').get(id)
      expect(row).toBeDefined()
    })

    it('rejects an empty description', () => {
      expect(() =>
        append({ entryDate: '2026-01-01', entryType: 'income', description: '   ', debit: 100 })
      ).toThrow(LedgerError)
    })

    it('rejects a no-op zero/zero standard transaction', () => {
      expect(() =>
        append({
          entryDate: '2026-01-01',
          entryType: 'income',
          description: 'x',
          debit: 0,
          credit: 0
        })
      ).toThrow(LedgerError)
    })

    it('rejects negative debit/credit', () => {
      expect(() =>
        append({ entryDate: '2026-01-01', entryType: 'expense', description: 'x', credit: -10 })
      ).toThrow(LedgerError)
    })

    it('allows a zero/zero MANUAL adjustment (zero-balance reconciliation marker)', () => {
      expect(() =>
        append({
          entryDate: '2026-01-01',
          entryType: 'manual_adjustment',
          description: 'reconciliation marker',
          debit: 0,
          credit: 0,
          isManualAdjustment: true
        })
      ).not.toThrow()
    })
  })

  describe('computeRunningBalances (BR-22 cumulative-from-first-entry)', () => {
    it('computes a correct running balance across mixed income/expense/void/adjustment rows', () => {
      append({ entryDate: '2026-01-01', entryType: 'income', description: 'rent jan', debit: 1000 })
      append({ entryDate: '2026-01-05', entryType: 'expense', description: 'repair', credit: 300 })
      append({
        entryDate: '2026-01-10',
        entryType: 'income_void',
        description: 'void jan',
        credit: 1000
      })
      append({
        entryDate: '2026-01-15',
        entryType: 'manual_adjustment',
        description: 'opening fix',
        debit: 50
      })

      const rows = computeRunningBalances(db, propertyId)
      // Hand-computed cumulative (debit - credit):
      //  +1000 (income)          => 1000
      //  -300  (expense)         => 700
      //  -1000 (income_void)     => -300
      //  +50   (manual adj.)     => -250
      expect(rows.map((r) => r.running_balance)).toEqual([1000, 700, -300, -250])
    })

    it('running balance is computed from the FIRST entry even when filtering a sub-period', () => {
      append({ entryDate: '2026-01-01', entryType: 'income', description: 'jan rent', debit: 1000 })
      append({ entryDate: '2026-02-01', entryType: 'income', description: 'feb rent', debit: 1000 })
      append({
        entryDate: '2026-03-01',
        entryType: 'expense',
        description: 'mar repair',
        credit: 400
      })

      // Filter to March only — the first row shown must still carry the 2000 from Jan+Feb.
      const rows = computeRunningBalances(db, propertyId, '2026-03-01')
      expect(rows).toHaveLength(1)
      expect(rows[0].running_balance).toBe(1600) // 1000 + 1000 - 400
    })

    it('returns an empty array for a property with no entries', () => {
      expect(computeRunningBalances(db, propertyId)).toEqual([])
    })

    it('orders rows by (entry_date, id) as a deterministic tiebreaker for same-day entries', () => {
      append({ entryDate: '2026-01-01', entryType: 'income', description: 'first', debit: 100 })
      append({ entryDate: '2026-01-01', entryType: 'income', description: 'second', debit: 200 })
      const rows = computeRunningBalances(db, propertyId)
      expect(rows.map((r) => r.description)).toEqual(['first', 'second'])
      expect(rows.map((r) => r.running_balance)).toEqual([100, 300])
    })

    it('isolates balances per property (a second property sees only its own entries)', () => {
      const other = Number(
        db
          .prepare(
            `INSERT INTO properties (code, name, type, country, currency, monthly_rent_default)
             VALUES ('P-2', 'Other', 'apartment', 'JO', 'JOD', 500)`
          )
          .run().lastInsertRowid
      )
      append({ entryDate: '2026-01-01', entryType: 'income', description: 'p1', debit: 500 })
      append({
        entryDate: '2026-01-01',
        entryType: 'income',
        description: 'p2',
        debit: 50,
        propertyId: other
      })

      expect(computeRunningBalances(db, propertyId)[0].running_balance).toBe(500)
      expect(computeRunningBalances(db, other)[0].running_balance).toBe(50)
    })
  })

  describe('reconstructBalanceAsOf (FR-LED-07)', () => {
    it('sums all debit-credit up to and including the given date', () => {
      append({ entryDate: '2026-01-01', entryType: 'income', description: 'a', debit: 1000 })
      append({ entryDate: '2026-06-01', entryType: 'expense', description: 'b', credit: 250 })
      append({ entryDate: '2026-12-01', entryType: 'income', description: 'c', debit: 100 })

      expect(reconstructBalanceAsOf(db, propertyId, '2025-12-31')).toBe(0)
      expect(reconstructBalanceAsOf(db, propertyId, '2026-01-01')).toBe(1000)
      expect(reconstructBalanceAsOf(db, propertyId, '2026-06-01')).toBe(750)
      expect(reconstructBalanceAsOf(db, propertyId, '2026-12-31')).toBe(850)
    })

    it('returns 0 for a property with no entries', () => {
      expect(reconstructBalanceAsOf(db, propertyId, '2026-01-01')).toBe(0)
    })
  })

  describe('computeSummary (SRS §9.8 summary bar)', () => {
    it('aggregates debit/credit/net/count over a window', () => {
      append({ entryDate: '2026-01-01', entryType: 'income', description: 'a', debit: 1000 })
      append({ entryDate: '2026-02-01', entryType: 'income', description: 'b', debit: 500 })
      append({ entryDate: '2026-03-01', entryType: 'expense', description: 'c', credit: 300 })

      const full = computeSummary(db, propertyId)
      expect(full).toEqual({
        total_debit: 1500,
        total_credit: 300,
        net_balance: 1200,
        row_count: 3
      })

      const janOnly = computeSummary(db, propertyId, '2026-01-01', '2026-01-31')
      expect(janOnly).toEqual({
        total_debit: 1000,
        total_credit: 0,
        net_balance: 1000,
        row_count: 1
      })
    })

    it('returns zeros and count 0 for an empty property/window', () => {
      expect(computeSummary(db, propertyId)).toEqual({
        total_debit: 0,
        total_credit: 0,
        net_balance: 0,
        row_count: 0
      })
    })
  })

  describe('generateReceiptNumber (BR-10 unique sequential)', () => {
    // Pin the year so the test is deterministic regardless of when it runs.
    const FIXED_YEAR = 2026
    function stubYear(year: number): void {
      const original = Date.prototype.getUTCFullYear

      Date.prototype.getUTCFullYear = () => year
      ;(Date.prototype.getUTCFullYear as unknown as { _restore?: () => void })._restore = () => {
        Date.prototype.getUTCFullYear = original
      }
    }
    function restoreYear(): void {
      ;(Date.prototype.getUTCFullYear as unknown as { _restore?: () => void })._restore?.()
    }

    it('produces RCT-YYYY-000001 for the very first receipt of a year', () => {
      stubYear(FIXED_YEAR)
      try {
        expect(generateReceiptNumber(db)).toBe('RCT-2026-000001')
      } finally {
        restoreYear()
      }
    })

    it('increments the sequence by parsing the numeric tail of the max receipt', () => {
      stubYear(FIXED_YEAR)
      try {
        db.prepare(
          'INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number) VALUES (?,?,?,?,?,?)'
        ).run(propertyId, 'rent', '2026-01-01', 100, 'JOD', 'RCT-2026-000001')
        db.prepare(
          'INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number) VALUES (?,?,?,?,?,?)'
        ).run(propertyId, 'rent', '2026-01-02', 100, 'JOD', 'RCT-2026-000007')
        expect(generateReceiptNumber(db)).toBe('RCT-2026-000008')
      } finally {
        restoreYear()
      }
    })

    it('restarts at 000001 when the year rolls over (no prior receipts for the new year)', () => {
      stubYear(FIXED_YEAR)
      try {
        db.prepare(
          'INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number) VALUES (?,?,?,?,?,?)'
        ).run(propertyId, 'rent', '2025-12-31', 100, 'JOD', 'RCT-2025-000099')
        expect(generateReceiptNumber(db)).toBe('RCT-2026-000001')
      } finally {
        restoreYear()
      }
    })
  })
})
