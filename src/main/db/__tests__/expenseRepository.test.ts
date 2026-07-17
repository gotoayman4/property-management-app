import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../migrations'
import {
  createExpense,
  voidExpense,
  listExpenses,
  listExpenseCategories,
  createExpenseCategory,
  ExpenseError,
  type CreateExpenseInput
} from '../expenseRepository'
import { computeRunningBalances, reconstructBalanceAsOf } from '../ledgerService'

/**
 * INTENT: Regression tests for the expense domain invariants: BR-11 (general-expense isolation),
 *         BR-13 (currency lock), BR-20 (immutability), BR-21 (atomicity). Mirrors the payment suite.
 */

describe('expenseRepository (BR-11/13/20/21)', () => {
  let db: Database.Database
  let propertyId: number
  let categoryId: number

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
    categoryId = (
      db
        .prepare(
          "SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'"
        )
        .get() as { id: number }
    ).id
  })

  function baseInput(overrides: Partial<CreateExpenseInput> = {}): CreateExpenseInput {
    return {
      property_id: propertyId,
      category_id: categoryId,
      expense_date: '2026-01-20',
      amount: 100,
      currency: 'JOD',
      property_currency: 'JOD',
      vendor_name: 'Acme Co.',
      ...overrides
    }
  }

  describe('createExpense', () => {
    it('writes an expense row AND its expense ledger row, returning both ids', () => {
      const result = createExpense(db, baseInput())
      expect(result.expense_id).toBeGreaterThan(0)
      expect(result.ledger_id).toBeGreaterThan(0)

      const ledger = db
        .prepare('SELECT entry_type, debit, credit FROM ledger_entries WHERE id = ?')
        .get(result.ledger_id) as { entry_type: string; debit: number; credit: number }
      expect(ledger.entry_type).toBe('expense')
      expect(ledger.debit).toBe(0)
      expect(ledger.credit).toBe(100)
    })

    it('rejects a currency that differs from the linked property currency (BR-13)', () => {
      expect(() =>
        createExpense(db, baseInput({ currency: 'USD', property_currency: 'JOD' }))
      ).toThrow(ExpenseError)
      expect((db.prepare('SELECT COUNT(*) AS n FROM expenses').get() as { n: number }).n).toBe(0)
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }).n
      ).toBe(0)
    })

    it('requires property_currency when a property is linked', () => {
      expect(() =>
        createExpense(db, baseInput({ property_currency: null as unknown as string }))
      ).toThrow(ExpenseError)
    })

    it('rejects a non-positive amount', () => {
      expect(() => createExpense(db, baseInput({ amount: 0 }))).toThrow(ExpenseError)
    })

    it('rejects an unknown category', () => {
      expect(() => createExpense(db, baseInput({ category_id: 99999 }))).toThrow(ExpenseError)
    })

    it('BR-21 atomicity: a ledger failure rolls back the expense insert too', () => {
      db.exec(
        `CREATE TRIGGER block_ledger_for_test
         BEFORE INSERT ON ledger_entries
         WHEN NEW.description LIKE '%__BLOCK_FOR_TEST__%'
         BEGIN
           SELECT RAISE(ABORT, 'forced ledger failure');
         END;`
      )
      // The expense description includes the vendor name — set it to the sentinel.
      expect(() => createExpense(db, baseInput({ vendor_name: '__BLOCK_FOR_TEST__' }))).toThrow()
      expect((db.prepare('SELECT COUNT(*) AS n FROM expenses').get() as { n: number }).n).toBe(0)
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }).n
      ).toBe(0)
    })

    it('BR-11: a GENERAL expense (no property) writes a ledger row with property_id NULL', () => {
      const result = createExpense(
        db,
        baseInput({ property_id: null, property_currency: null, currency: 'JOD' })
      )
      const ledger = db
        .prepare('SELECT property_id FROM ledger_entries WHERE id = ?')
        .get(result.ledger_id) as { property_id: number | null }
      expect(ledger.property_id).toBeNull()

      // It must NOT appear in any property's running balance.
      expect(computeRunningBalances(db, propertyId)).toHaveLength(0)
      expect(reconstructBalanceAsOf(db, propertyId, '2026-12-31')).toBe(0)
    })
  })

  describe('voidExpense (BR-20 immutability)', () => {
    it('flips is_voided, records the reason, and appends an expense_void reversal row', () => {
      const created = createExpense(db, baseInput({ amount: 250 }))
      const ledgerCountBefore = (
        db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }
      ).n

      const voided = voidExpense(db, created.expense_id, 'duplicate bill')
      const expense = db
        .prepare('SELECT is_voided, void_reason FROM expenses WHERE id = ?')
        .get(created.expense_id) as { is_voided: number; void_reason: string }
      expect(expense.is_voided).toBe(1)
      expect(expense.void_reason).toBe('duplicate bill')

      const reversal = db
        .prepare('SELECT entry_type, debit, credit FROM ledger_entries WHERE id = ?')
        .get(voided.ledger_id) as { entry_type: string; debit: number; credit: number }
      expect(reversal.entry_type).toBe('expense_void')
      expect(reversal.debit).toBe(250) // equal-and-opposite
      expect(reversal.credit).toBe(0)

      const ledgerCountAfter = (
        db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get() as { n: number }
      ).n
      expect(ledgerCountAfter).toBe(ledgerCountBefore + 1)
    })

    it('rejects voiding an already-voided expense', () => {
      const created = createExpense(db, baseInput())
      voidExpense(db, created.expense_id, 'first')
      expect(() => voidExpense(db, created.expense_id, 'second')).toThrow(ExpenseError)
    })

    it('rejects an empty void reason', () => {
      const created = createExpense(db, baseInput())
      expect(() => voidExpense(db, created.expense_id, '')).toThrow(ExpenseError)
    })

    it('net running balance is zero after voiding a single expense (BR-20/22)', () => {
      const created = createExpense(db, baseInput({ amount: 300 }))
      voidExpense(db, created.expense_id, 'reversed')
      expect(reconstructBalanceAsOf(db, propertyId, '2026-12-31')).toBe(0)
    })

    it('the original expense ledger row is never mutated on void', () => {
      const created = createExpense(db, baseInput({ amount: 180 }))
      const before = db
        .prepare(
          'SELECT id, entry_type, debit, credit, description FROM ledger_entries WHERE id = ?'
        )
        .get(created.ledger_id)
      voidExpense(db, created.expense_id, 'x')
      const after = db
        .prepare(
          'SELECT id, entry_type, debit, credit, description FROM ledger_entries WHERE id = ?'
        )
        .get(created.ledger_id)
      expect(after).toEqual(before)
    })
  })

  describe('listExpenses + categories', () => {
    it('returns joined labels and respects the general_only and property filters', () => {
      createExpense(db, baseInput({ amount: 100 })) // property-linked
      createExpense(
        db,
        baseInput({ property_id: null, property_currency: null, amount: 50, currency: 'JOD' })
      ) // general

      expect((listExpenses(db) as unknown[]).length).toBe(2)
      expect((listExpenses(db, { property_id: propertyId }) as unknown[]).length).toBe(1)
      expect((listExpenses(db, { general_only: true }) as unknown[]).length).toBe(1)
    })

    it('seeds 10 default categories and lets users add a custom one', () => {
      const defaults = listExpenseCategories(db)
      expect(defaults.length).toBe(10)
      expect(defaults.every((c) => c.is_default === 1)).toBe(true)

      const newId = createExpenseCategory(db, 'internet')
      const cats = listExpenseCategories(db)
      expect(cats.find((c) => c.id === newId)?.name_key).toBe('expense.category.internet')
      expect(cats.find((c) => c.id === newId)?.is_default).toBe(0)
    })

    it('rejects a duplicate category name', () => {
      createExpenseCategory(db, 'internet')
      expect(() => createExpenseCategory(db, 'expense.category.internet')).toThrow(ExpenseError)
    })

    it('rejects an empty category name', () => {
      expect(() => createExpenseCategory(db, '   ')).toThrow(ExpenseError)
    })
  })
})
