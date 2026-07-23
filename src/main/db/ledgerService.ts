import { Database } from 'better-sqlite3'
import {
  resolveLocaleKey,
  tryResolveLocaleKey,
  type ExportLanguage
} from '../services/exportService/exportUtils'

/**
 * @file ledgerService — the immutable Financial Ledger engine (SRS §5.15, §8.2; BR-20/21/22).
 *
 * INTENT: Provide the ONLY functions that write to / read from `ledger_entries`. Centralizing
 *         ledger access here guarantees the immutability invariant (BR-20) is impossible to
 *         violate by accident: there is no update/delete helper exposed anywhere.
 *
 * CONSTRAINTS:
 *   - BR-20 Immutability: a ledger row is never UPDATEd or DELETEd after creation. The only
 *     corrective action is appending a reversal row (income_void/expense_void) or a
 *     manual_adjustment row. This module deliberately exports NO mutation/deletion API.
 *   - BR-21 Atomicity: `appendLedgerEntry` must be called INSIDE the caller's existing
 *     `db.transaction()` (alongside the payments/expenses insert) so the pair is all-or-nothing.
 *   - BR-22 Running balance: balances are ALWAYS derived fresh via a windowed cumulative SUM
 *     from the FIRST entry for a property — never stored, never cached.
 *
 * DECISION: Each helper takes `db` as a parameter rather than importing the singleton, so the
 *           ledger math is exhaustively unit-testable against a fresh in-memory DB.
 */

/** The set of entry_type values allowed on a ledger row (mirrors the SQL CHECK constraint). */
export type LedgerEntryType =
  'income' | 'expense' | 'income_void' | 'expense_void' | 'manual_adjustment'

/** What kind of source transaction a ledger row points back to. */
export type LedgerReferenceType = 'payment' | 'expense' | 'recurring_expense' | 'manual'

/** Input shape for appending a new ledger row. */
export interface LedgerEntryInput {
  entryDate: string // YYYY-MM-DD
  entryType: LedgerEntryType
  referenceType?: LedgerReferenceType
  referenceId?: number | null
  propertyId?: number | null
  description: string
  debit?: number
  credit?: number
  currency: string
  isManualAdjustment?: boolean
  /**
   * Frozen reporting-currency snapshot for the row's signed amount (debit - credit).
   * When provided, the row carries reporting_currency/exchange_rate/base_amount so reports
   * can consolidate deterministically without re-deriving rates. Omit for manual_adjustment
   * rows that have no natural transaction currency.
   */
  snapshot?: {
    reportingCurrency: string
    exchangeRate: number
    /** (debit - credit) * exchangeRate, in reporting currency. */
    baseAmount: number
  } | null
}

/** A ledger row with its computed running balance (BR-22). */
export interface LedgerRowWithBalance {
  id: number
  entry_date: string
  entry_type: LedgerEntryType
  reference_type: LedgerReferenceType | null
  reference_id: number | null
  property_id: number | null
  description: string
  debit: number
  credit: number
  currency: string
  is_manual_adjustment: number
  created_at: string
  /** Cumulative (debit - credit) from the FIRST entry for this property up to and including this row. */
  running_balance: number
  /** Frozen reporting-currency snapshot (NULL when no rate existed at write time). */
  reporting_currency: string | null
  exchange_rate: number | null
  base_amount: number | null
}

/** Summary totals for a property over an optional date window. */
export interface LedgerSummary {
  total_debit: number
  total_credit: number
  /** total_debit - total_credit over the window. */
  net_balance: number
  /** Count of rows in the window (useful for empty-state detection). */
  row_count: number
}

const PAYMENT_TYPE_I18N: Record<string, string> = {
  rent: 'payment.rent',
  deposit: 'payment.deposit',
  other_income: 'payment.otherIncome'
}

/**
 * Resolve i18n keys embedded in a ledger description string. Ledger descriptions are
 * denormalized plain-text strings written at creation time. Expense descriptions contain
 * raw `expense.category.*` name_keys; payment descriptions contain raw payment_type
 * enum values. This function post-processes the `—`-separated segments and resolves any
 * known translatable tokens to the user's language.
 */
export function localizeLedgerDescription(description: string, lang: ExportLanguage): string {
  const segments = description.split(' — ')
  let changed = false
  const resolved = segments.map((seg) => {
    const trimmed = seg.trim()
    if (trimmed.startsWith('expense.category.')) {
      const translated = tryResolveLocaleKey(trimmed, lang)
      if (translated !== trimmed) {
        changed = true
        return translated
      }
    }
    const i18nKey = PAYMENT_TYPE_I18N[trimmed]
    if (i18nKey) {
      changed = true
      return resolveLocaleKey(i18nKey, lang)
    }
    return seg
  })
  return changed ? resolved.join(' — ') : description
}

/**
 * Append a single immutable ledger row. Returns the new row id.
 * MUST be called inside the caller's transaction for atomicity (BR-21).
 */
export function appendLedgerEntry(db: Database, input: LedgerEntryInput): number {
  if (input.description.trim().length === 0) {
    throw new LedgerError('LEDGER_DESCRIPTION_REQUIRED')
  }
  const debit = input.debit ?? 0
  const credit = input.credit ?? 0
  // Exactly one side of the double-entry carries the amount for standard transactions; manual
  // adjustments may legitimately set both, so we only validate that at least one is non-negative
  // and that the row is not a no-op (both zero) unless it is a manual adjustment the caller
  // explicitly requested (rare but allowed for zero-balance reconciliation markers).
  if (debit < 0 || credit < 0) {
    throw new LedgerError('LEDGER_NEGATIVE_AMOUNT')
  }
  if (
    debit === 0 &&
    credit === 0 &&
    input.entryType !== 'manual_adjustment' &&
    !input.isManualAdjustment
  ) {
    throw new LedgerError('LEDGER_ZERO_AMOUNT')
  }

  const snapshot = input.snapshot ?? null
  const result = db
    .prepare(
      `INSERT INTO ledger_entries
         (entry_date, entry_type, reference_type, reference_id, property_id,
          description, debit, credit, currency, is_manual_adjustment,
          reporting_currency, exchange_rate, base_amount)
       VALUES (@entry_date, @entry_type, @reference_type, @reference_id, @property_id,
               @description, @debit, @credit, @currency, @is_manual_adjustment,
               @reporting_currency, @exchange_rate, @base_amount)`
    )
    .run({
      entry_date: input.entryDate,
      entry_type: input.entryType,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      property_id: input.propertyId ?? null,
      description: input.description,
      debit,
      credit,
      currency: input.currency,
      is_manual_adjustment: input.isManualAdjustment ? 1 : 0,
      reporting_currency: snapshot?.reportingCurrency ?? null,
      exchange_rate: snapshot?.exchangeRate ?? null,
      base_amount: snapshot?.baseAmount ?? null
    })
  return Number(result.lastInsertRowid)
}

/**
 * Return ledger rows for a property, each annotated with its running balance.
 *
 * BR-22: the running balance is the cumulative (debit - credit) computed from the FIRST entry
 * ever recorded for the property, even when `fromDate`/`toDate` restrict the returned rows to a
 * sub-period. We implement this by windowing the SUM over the FULL property history and then
 * filtering the projected rows to the requested window — so an early-period income that predates
 * the window still correctly seeds the first displayed row's balance.
 *
 * Rows are ordered chronologically (entry_date, then id as a deterministic tiebreaker).
 */
export function computeRunningBalances(
  db: Database,
  propertyId: number,
  fromDate?: string,
  toDate?: string,
  lang?: ExportLanguage
): LedgerRowWithBalance[] {
  // Windowed cumulative sum over the property's entire history, then filter to the window.
  // SQLite supports window functions since 3.25, which better-sqlite3 ships well above.
  let query = `
    SELECT * FROM (
      SELECT
        id, entry_date, entry_type, reference_type, reference_id, property_id,
        description, debit, credit, currency, is_manual_adjustment, created_at,
        reporting_currency, exchange_rate, base_amount,
        SUM(debit - credit) OVER (
          ORDER BY entry_date ASC, id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_balance
      FROM ledger_entries
      WHERE property_id = @propertyId
    )
    WHERE 1=1
  `
  const params: Record<string, unknown> = { propertyId }
  if (fromDate) {
    query += ' AND entry_date >= @fromDate'
    params.fromDate = fromDate
  }
  if (toDate) {
    query += ' AND entry_date <= @toDate'
    params.toDate = toDate
  }
  query += ' ORDER BY entry_date ASC, id ASC'

  const rows = db.prepare(query).all(params) as LedgerRowWithBalance[]
  if (lang) {
    for (const row of rows) {
      row.description = localizeLedgerDescription(row.description, lang)
    }
  }
  return rows
}

/**
 * Reconstruct a property's net balance as of a given date (FR-LED-07). Returns the cumulative
 * (debit - credit) across ALL ledger entries for the property dated on or before `asOfDate`.
 * Pure SELECT — never depends on any cached/stored balance.
 */
export function reconstructBalanceAsOf(
  db: Database,
  propertyId: number,
  asOfDate: string,
  inReportingCurrency = false
): number {
  // When inReportingCurrency is requested, sum the frozen base_amount snapshot (signed net per
  // row) instead of native debit-credit. Rows with no snapshot fall back to debit-credit so the
  // reconstruction never silently drops history.
  const sumExpr = inReportingCurrency ? 'COALESCE(base_amount, debit - credit)' : '(debit - credit)'
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${sumExpr}), 0) AS balance
       FROM ledger_entries
       WHERE property_id = ? AND entry_date <= ?`
    )
    .get(propertyId, asOfDate) as { balance: number } | undefined
  return row?.balance ?? 0
}

/**
 * Compute debit/credit/net totals for a property over an optional date window (the ledger
 * summary bar per SRS §9.8). Window bounds are inclusive.
 */
export function computeSummary(
  db: Database,
  propertyId: number,
  fromDate?: string,
  toDate?: string
): LedgerSummary {
  let query = `
    SELECT
      COALESCE(SUM(debit), 0)  AS total_debit,
      COALESCE(SUM(credit), 0) AS total_credit,
      COUNT(*)                  AS row_count
    FROM ledger_entries
    WHERE property_id = @propertyId
  `
  const params: Record<string, unknown> = { propertyId }
  if (fromDate) {
    query += ' AND entry_date >= @fromDate'
    params.fromDate = fromDate
  }
  if (toDate) {
    query += ' AND entry_date <= @toDate'
    params.toDate = toDate
  }
  const row = db.prepare(query).get(params) as
    { total_debit: number; total_credit: number; row_count: number } | undefined
  const totalDebit = row?.total_debit ?? 0
  const totalCredit = row?.total_credit ?? 0
  return {
    total_debit: totalDebit,
    total_credit: totalCredit,
    net_balance: totalDebit - totalCredit,
    row_count: row?.row_count ?? 0
  }
}

/**
 * Same as computeSummary but returns totals in the configured REPORTING currency via the frozen
 * base_amount snapshot on each ledger row. Used by the Ledger page toggle.
 *
 * CONSTRAINT: base_amount is the SIGNED net (debit - credit) snapshot, so the reporting-currency
 *             debit/credit split is reconstructed as positive vs negative contributions — this
 *             preserves the net_balance exactly while giving the UI a debit/credit-style display.
 *             Rows with NULL base_amount fall back to native debit-credit (graceful).
 */
export function computeSummaryReporting(
  db: Database,
  propertyId: number,
  fromDate?: string,
  toDate?: string
): LedgerSummary {
  let query = `
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(base_amount, debit - credit) > 0
                        THEN COALESCE(base_amount, debit - credit) ELSE 0 END), 0) AS total_debit,
      COALESCE(SUM(CASE WHEN COALESCE(base_amount, debit - credit) < 0
                        THEN ABS(COALESCE(base_amount, debit - credit)) ELSE 0 END), 0) AS total_credit,
      COUNT(*) AS row_count
    FROM ledger_entries
    WHERE property_id = @propertyId
  `
  const params: Record<string, unknown> = { propertyId }
  if (fromDate) {
    query += ' AND entry_date >= @fromDate'
    params.fromDate = fromDate
  }
  if (toDate) {
    query += ' AND entry_date <= @toDate'
    params.toDate = toDate
  }
  const row = db.prepare(query).get(params) as
    { total_debit: number; total_credit: number; row_count: number } | undefined
  const totalDebit = row?.total_debit ?? 0
  const totalCredit = row?.total_credit ?? 0
  return {
    total_debit: totalDebit,
    total_credit: totalCredit,
    net_balance: totalDebit - totalCredit,
    row_count: row?.row_count ?? 0
  }
}

/**
 * Generate the next sequential, globally-unique receipt number (BR-10, FR-SET-10).
 * Format: `{prefix}-{year}-{sequence}` where prefix and starting sequence are read from
 * settings (FR-SET-10). The year component is mandatory per SRS. Sequence continues from
 * the highest existing receipt number for that year.
 *
 * CAVEAT: If settings lack receipt_prefix/receipt_starting_sequence (pre-migration DB),
 *         falls back to 'RCT' and 1 respectively.
 */
export function generateReceiptNumber(db: Database): string {
  const year = new Date().getUTCFullYear()
  const settings = db
    .prepare('SELECT receipt_prefix, receipt_starting_sequence FROM settings WHERE id = 1')
    .get() as { receipt_prefix: string; receipt_starting_sequence: number } | undefined
  const userPrefix = settings?.receipt_prefix ?? 'RCT'
  const yearPrefix = `${userPrefix}-${year}-`
  const row = db
    .prepare(
      `SELECT receipt_number FROM payments
       WHERE receipt_number LIKE ? ESCAPE '\\'
       ORDER BY receipt_number DESC LIMIT 1`
    )
    .get(`${yearPrefix}%`) as { receipt_number: string } | undefined

  let next = settings?.receipt_starting_sequence ?? 1
  if (row?.receipt_number) {
    const tail = row.receipt_number.slice(yearPrefix.length)
    const parsed = parseInt(tail, 10)
    if (!Number.isNaN(parsed)) {
      next = parsed + 1
    }
  }
  return `${yearPrefix}${String(next).padStart(6, '0')}`
}

/** Domain error thrown by ledger helpers; carries a machine-readable code for the IPC layer. */
export class LedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}
