import { Database } from 'better-sqlite3'
import { appendLedgerEntry } from './ledgerService'

/**
 * @file expenseRepository — the data-access boundary for expenses (SRS §5.6, §8.2).
 *
 * INTENT: Encapsulate EVERY expense write so the BR-21 atomicity invariant (expense row + ledger
 *         row in ONE transaction) cannot be bypassed, mirroring paymentRepository.
 *
 * CONSTRAINTS:
 *   - BR-13 Currency lock: when the expense IS linked to a property, the currency must match that
 *     property's currency. General (property_id NULL) expenses accept the user's chosen currency.
 *   - BR-20/21 Immutability+atomicity: voiding appends an expense_void reversal row; the original
 *     expense row and its expense ledger row are never modified (beyond is_voided/void_reason).
 *   - BR-11 General expenses have property_id NULL and never appear in any property ledger.
 *
 * DECISION: For property-linked expenses the ledger row references property_id; for general
 *           expenses property_id is NULL, so they are excluded from per-property running balances
 *           and only surface in portfolio-wide reports (a later phase).
 */

export interface CreateExpenseInput {
  property_id?: number | null
  category_id: number
  recurring_template_id?: number | null
  expense_date: string // YYYY-MM-DD
  vendor_name?: string | null
  amount: number
  currency: string
  /** The linked property's currency (required when property_id is set, for the BR-13 check). */
  property_currency?: string | null
  notes?: string | null
  receipt_file_path?: string | null
}

export interface CreatedExpense {
  expense_id: number
  ledger_id: number
}

export function createExpense(db: Database, input: CreateExpenseInput): CreatedExpense {
  if (input.amount <= 0) {
    throw new ExpenseError('EXPENSE_AMOUNT_INVALID')
  }
  // BR-13: a property-linked expense must use that property's currency.
  if (input.property_id) {
    if (!input.property_currency) {
      throw new ExpenseError('EXPENSE_PROPERTY_CURRENCY_REQUIRED')
    }
    if (input.currency !== input.property_currency) {
      throw new ExpenseError('EXPENSE_CURRENCY_MISMATCH')
    }
  }
  // Validate the category exists.
  const category = db
    .prepare('SELECT id FROM expense_categories WHERE id = ?')
    .get(input.category_id)
  if (!category) throw new ExpenseError('EXPENSE_CATEGORY_NOT_FOUND')

  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO expenses
           (property_id, category_id, recurring_template_id, expense_date, vendor_name,
            amount, currency, notes, receipt_file_path)
         VALUES
           (@property_id, @category_id, @recurring_template_id, @expense_date, @vendor_name,
            @amount, @currency, @notes, @receipt_file_path)`
      )
      .run({
        property_id: input.property_id ?? null,
        category_id: input.category_id,
        recurring_template_id: input.recurring_template_id ?? null,
        expense_date: input.expense_date,
        vendor_name: input.vendor_name ?? null,
        amount: input.amount,
        currency: input.currency,
        notes: input.notes ?? null,
        receipt_file_path: input.receipt_file_path ?? null
      })
    const expenseId = Number(result.lastInsertRowid)

    const description = buildExpenseDescription(db, input)
    const ledgerId = appendLedgerEntry(db, {
      entryDate: input.expense_date,
      entryType: 'expense',
      referenceType: 'expense',
      referenceId: expenseId,
      propertyId: input.property_id ?? null,
      description,
      debit: 0,
      credit: input.amount,
      currency: input.currency
    })
    return { expense_id: expenseId, ledger_id: ledgerId }
  })()
}

export function voidExpense(
  db: Database,
  expenseId: number,
  reason: string
): { ledger_id: number } {
  const trimmed = reason?.trim() ?? ''
  if (trimmed.length === 0) {
    throw new ExpenseError('VOID_REASON_REQUIRED')
  }

  return db.transaction(() => {
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as
      ExpenseRow | undefined
    if (!expense) throw new ExpenseError('EXPENSE_NOT_FOUND')
    if (expense.is_voided === 1) throw new ExpenseError('EXPENSE_ALREADY_VOID')

    db.prepare('UPDATE expenses SET is_voided = 1, void_reason = ? WHERE id = ?').run(
      trimmed,
      expenseId
    )

    const ledgerId = appendLedgerEntry(db, {
      entryDate: expense.expense_date,
      entryType: 'expense_void',
      referenceType: 'expense',
      referenceId: expenseId,
      propertyId: expense.property_id,
      description: `Void: expense #${expenseId} — ${trimmed}`,
      debit: expense.amount, // equal-and-opposite reversal
      credit: 0,
      currency: expense.currency
    })
    return { ledger_id: ledgerId }
  })()
}

/** List expenses with optional filters; joined with property + category labels. */
export function listExpenses(
  db: Database,
  filters?: {
    property_id?: number
    category_id?: number
    from_date?: string
    to_date?: string
    general_only?: boolean
  }
): unknown[] {
  let query = `
    SELECT e.*,
           p.name AS property_name, p.code AS property_code,
           ec.name_key AS category_name_key
    FROM expenses e
    LEFT JOIN properties p ON e.property_id = p.id
    JOIN expense_categories ec ON e.category_id = ec.id
    WHERE 1=1
  `
  const params: Record<string, unknown> = {}
  if (filters) {
    if (filters.general_only) {
      query += ' AND e.property_id IS NULL'
    } else if (filters.property_id) {
      query += ' AND e.property_id = @property_id'
      params.property_id = filters.property_id
    }
    if (filters.category_id) {
      query += ' AND e.category_id = @category_id'
      params.category_id = filters.category_id
    }
    if (filters.from_date) {
      query += ' AND e.expense_date >= @from_date'
      params.from_date = filters.from_date
    }
    if (filters.to_date) {
      query += ' AND e.expense_date <= @to_date'
      params.to_date = filters.to_date
    }
  }
  query += ' ORDER BY e.expense_date DESC, e.id DESC'
  return db.prepare(query).all(params)
}

/** List all expense categories (defaults + user-added), ordered defaults-first then by name. */
export function listExpenseCategories(
  db: Database
): { id: number; name_key: string; is_default: number }[] {
  return db
    .prepare(
      'SELECT id, name_key, is_default FROM expense_categories ORDER BY is_default DESC, name_key ASC'
    )
    .all() as { id: number; name_key: string; is_default: number }[]
}

/** Add a user-defined expense category (FR-EXP-03). name_key is namespaced under expense.category.* */
export function createExpenseCategory(db: Database, nameKey: string): number {
  const trimmed = nameKey.trim()
  if (trimmed.length === 0) {
    throw new ExpenseError('EXPENSE_CATEGORY_NAME_REQUIRED')
  }
  const namespaced = trimmed.startsWith('expense.category.')
    ? trimmed
    : `expense.category.${trimmed}`
  try {
    const result = db
      .prepare('INSERT INTO expense_categories (name_key, is_default) VALUES (?, 0)')
      .run(namespaced)
    return Number(result.lastInsertRowid)
  } catch {
    // UNIQUE constraint on name_key
    throw new ExpenseError('EXPENSE_CATEGORY_DUPLICATE')
  }
}

interface ExpenseRow {
  id: number
  property_id: number | null
  category_id: number
  expense_date: string
  vendor_name: string | null
  amount: number
  currency: string
  is_voided: number
}

function buildExpenseDescription(db: Database, input: CreateExpenseInput): string {
  const parts: string[] = []
  if (input.property_id) {
    const prop = db
      .prepare('SELECT name, code FROM properties WHERE id = ?')
      .get(input.property_id) as { name: string; code: string } | undefined
    if (prop) parts.push(prop.code)
  } else {
    parts.push('general')
  }
  const cat = db
    .prepare('SELECT name_key FROM expense_categories WHERE id = ?')
    .get(input.category_id) as { name_key: string } | undefined
  if (cat) parts.push(cat.name_key)
  if (input.vendor_name) parts.push(input.vendor_name)
  return parts.join(' — ')
}

export class ExpenseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpenseError'
  }
}
