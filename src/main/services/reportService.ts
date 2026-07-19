/**
 * @file reportService — data assembly for the 5 core reports (SRS §5.7, §14).
 *
 * INTENT: Each builder runs one parameterized SELECT, shapes the rows into the normalized
 *         ReportData structure, and groups by currency where the report spans currencies (BR-14).
 *         The service is the only place report SQL lives — IPC handlers and exporters are kept
 *         free of SQL and free of presentation.
 *
 * CONSTRAINTS:
 *   - NFR-SEC-05: every query uses named/positional parameters. No string concatenation into SQL.
 *   - NFR-PAGE-01: every list query is bounded by REPORT_ROW_LIMIT.
 *   - BR-13: rows already carry the property's own currency (set at write time); we never
 *            recompute or convert here — conversion is display-only.
 *   - BR-22: the ledger report reuses `computeRunningBalances` so the running balance is always
 *            derived fresh from the first entry ever, even when filtering to a sub-period.
 *
 * DECISION: each builder takes the `db` instance as a parameter so the whole module is
 *           exhaustively unit-testable against an in-memory DB (mirrors ledgerService.ts).
 */

import { Database } from 'better-sqlite3'
import { computeRunningBalances } from '../db/ledgerService'
import {
  type ReportData,
  type ReportColumn,
  groupByCurrency,
  REPORT_ROW_LIMIT
} from './exportService/exportUtils'
import { extendedBuilders } from './reportServiceExtended'

// Re-export for reportServiceExtended.ts
export { type ReportData, type ReportColumn, groupByCurrency, REPORT_ROW_LIMIT }

/** Filters accepted by every report builder. Re-declared here so reportService is self-contained. */
export interface ReportFilters {
  from_date?: string
  to_date?: string
  property_id?: number
  tenant_id?: number
  ledger_property_id?: number
  payment_method?: string
  category_id?: number
  language?: 'ar' | 'en'
}

/** The set of report types this phase supports (SRS §5.7 — 11 reports). */
export type ReportType =
  | 'income'
  | 'expense'
  | 'profit_loss'
  | 'property_profitability'
  | 'tenant_payment_history'
  | 'outstanding_balances'
  | 'vacancy'
  | 'contract_expiry'
  | 'recurring_schedule'
  | 'document_expiry'
  | 'ledger'

/** Machine-readable error codes thrown by builders; the IPC layer maps these to the renderer. */
export class ReportError extends Error {
  constructor(public code: string) {
    super(code)
    this.name = 'ReportError'
  }
}

/** Resolve the language filter once, defaulting to Arabic (BR-30). */
function langOf(filters: ReportFilters): 'ar' | 'en' {
  return filters.language === 'en' ? 'en' : 'ar'
}

/**
 * Build a date-range WHERE clause fragment shared by all time-based reports.
 * Returns the clause (without leading WHERE) and mutates the params object with bound values.
 */
export function dateRangeClause(
  dateColumn: string,
  filters: ReportFilters,
  params: Record<string, unknown>
): string {
  const clauses: string[] = []
  if (filters.from_date) {
    clauses.push(`${dateColumn} >= @from_date`)
    params.from_date = filters.from_date
  }
  if (filters.to_date) {
    clauses.push(`${dateColumn} <= @to_date`)
    params.to_date = filters.to_date
  }
  return clauses.length > 0 ? clauses.join(' AND ') : '1=1'
}

/* -------------------------------------------------------------------------- */
/* Report 1 — Income (FR-REP-02, SRS §14.1)                                   */
/* -------------------------------------------------------------------------- */

const INCOME_COLUMNS: ReportColumn[] = [
  { key: 'payment_date', headerKey: 'reports.col.date', type: 'date' },
  { key: 'receipt_number', headerKey: 'reports.col.receiptNo', type: 'text' },
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  { key: 'tenant_name', headerKey: 'reports.col.tenant', type: 'text' },
  { key: 'payment_type', headerKey: 'reports.col.paymentType', type: 'text' },
  { key: 'payment_method', headerKey: 'reports.col.paymentMethod', type: 'text' },
  { key: 'amount', headerKey: 'reports.col.amount', type: 'currency', sumInTotals: true }
]

function buildIncomeReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const conditions = [dateRangeClause('p.payment_date', filters, params), 'p.is_voided = 0']
  if (filters.property_id) {
    conditions.push('p.property_id = @property_id')
    params.property_id = filters.property_id
  }
  if (filters.tenant_id) {
    conditions.push('p.tenant_id = @tenant_id')
    params.tenant_id = filters.tenant_id
  }
  if (filters.payment_method) {
    conditions.push('p.payment_method = @payment_method')
    params.payment_method = filters.payment_method
  }

  const rows = db
    .prepare(
      `SELECT p.payment_date, p.receipt_number, p.amount, p.currency, p.payment_type, p.payment_method,
              pr.name AS property_name, t.fullname AS tenant_name
         FROM payments p
         LEFT JOIN properties pr ON p.property_id = pr.id
         LEFT JOIN tenants t ON p.tenant_id = t.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.payment_date DESC, p.id DESC
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  const groups = groupByCurrency(rows, 'currency', ['amount'])
  return {
    titleKey: 'reports.type.income',
    columns: INCOME_COLUMNS,
    groups
  }
}

/* -------------------------------------------------------------------------- */
/* Report 2 — Expense (FR-REP-03, SRS §14.2)                                  */
/* -------------------------------------------------------------------------- */

const EXPENSE_COLUMNS: ReportColumn[] = [
  { key: 'expense_date', headerKey: 'reports.col.date', type: 'date' },
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  { key: 'category_key', headerKey: 'reports.col.category', type: 'text' },
  { key: 'vendor_name', headerKey: 'reports.col.vendor', type: 'text' },
  { key: 'amount', headerKey: 'reports.col.amount', type: 'currency', sumInTotals: true }
]

function buildExpenseReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const conditions = [dateRangeClause('e.expense_date', filters, params), 'e.is_voided = 0']
  if (filters.property_id) {
    conditions.push('e.property_id = @property_id')
    params.property_id = filters.property_id
  }
  if (filters.category_id) {
    conditions.push('e.category_id = @category_id')
    params.category_id = filters.category_id
  }

  const rows = db
    .prepare(
      `SELECT e.expense_date, e.amount, e.currency, e.vendor_name,
              ec.name_key AS category_key,
              pr.name AS property_name
         FROM expenses e
         LEFT JOIN expense_categories ec ON e.category_id = ec.id
         LEFT JOIN properties pr ON e.property_id = pr.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.expense_date DESC, e.id DESC
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  const groups = groupByCurrency(rows, 'currency', ['amount'])
  return {
    titleKey: 'reports.type.expense',
    columns: EXPENSE_COLUMNS,
    groups
  }
}

/* -------------------------------------------------------------------------- */
/* Report 3 — Profit & Loss (FR-REP-04, SRS §14.3)                            */
/* -------------------------------------------------------------------------- */

const PNL_COLUMNS: ReportColumn[] = [
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'country', headerKey: 'reports.col.country', type: 'text' },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  {
    key: 'total_income',
    headerKey: 'reports.col.totalIncome',
    type: 'currency',
    sumInTotals: true
  },
  {
    key: 'total_expense',
    headerKey: 'reports.col.totalExpense',
    type: 'currency',
    sumInTotals: true
  },
  { key: 'net_profit', headerKey: 'reports.col.netProfit', type: 'currency', sumInTotals: true },
  { key: 'margin_percent', headerKey: 'reports.col.marginPercent', type: 'number' }
]

function buildProfitLossReport(db: Database, filters: ReportFilters): ReportData {
  // Per-property income and expense sums over the window, joined to the property for currency.
  const params: Record<string, unknown> = {}
  const incomeCond = dateRangeClause('p.payment_date', filters, params)
  const expenseCond = dateRangeClause('e.expense_date', filters, params)
  if (filters.property_id) params.property_id = filters.property_id
  const propertyFilter = filters.property_id ? 'WHERE pr.id = @property_id' : ''

  const rows = db
    .prepare(
      `SELECT pr.id, pr.name AS property_name, pr.country, pr.currency,
              COALESCE(income.total_income, 0) AS total_income,
              COALESCE(expense.total_expense, 0) AS total_expense,
              (COALESCE(income.total_income, 0) - COALESCE(expense.total_expense, 0)) AS net_profit
         FROM properties pr
         LEFT JOIN (
           SELECT property_id, SUM(amount) AS total_income
             FROM payments p
            WHERE p.is_voided = 0 AND ${incomeCond}
            GROUP BY property_id
         ) income ON income.property_id = pr.id
         LEFT JOIN (
           SELECT property_id, SUM(amount) AS total_expense
             FROM expenses e
            WHERE e.is_voided = 0 AND ${expenseCond}
            GROUP BY property_id
         ) expense ON expense.property_id = pr.id
         ${propertyFilter}
        WHERE pr.is_archived = 0
        ORDER BY pr.currency, pr.name
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown> & { net_profit: number; total_income: number }>

  // Profit margin (%) = net / income * 100, guarded against division by zero.
  for (const row of rows) {
    const income = Number(row.total_income ?? 0)
    const net = Number(row.net_profit ?? 0)
    row['margin_percent'] = income > 0 ? Math.round((net / income) * 1000) / 10 : 0
  }

  const groups = groupByCurrency(rows, 'currency', ['total_income', 'total_expense', 'net_profit'])
  return {
    titleKey: 'reports.type.profitLoss',
    columns: PNL_COLUMNS,
    groups,
    // BR-14: a portfolio summary across currencies is intentionally NOT auto-summed. A note
    // clarifies that the per-currency subtotals are authoritative; consolidated conversion
    // requires explicit exchange-rate selection (deferred to a follow-up phase).
    consolidatedNote: groups.length > 1 ? 'reports.consolidatedNoteMultiCurrency' : undefined
  }
}

/* -------------------------------------------------------------------------- */
/* Report 4 — Vacancy (FR-REP-08, SRS §14.7)                                  */
/* -------------------------------------------------------------------------- */

const VACANCY_COLUMNS: ReportColumn[] = [
  { key: 'code', headerKey: 'reports.col.propertyCode', type: 'text' },
  { key: 'name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'type', headerKey: 'reports.col.propertyType', type: 'text' },
  { key: 'country', headerKey: 'reports.col.country', type: 'text' },
  { key: 'last_occupied', headerKey: 'reports.col.lastOccupied', type: 'date' },
  { key: 'days_vacant', headerKey: 'reports.col.daysVacant', type: 'number' }
]

function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildVacancyReport(db: Database, filters: ReportFilters): ReportData {
  const today = toLocalISODate(new Date())
  const params: Record<string, unknown> = { today }
  const propertyFilter = filters.property_id ? 'AND pr.id = @property_id' : ''
  if (filters.property_id) params.property_id = filters.property_id

  // Last contract end date per property, used as the "last occupied" date.
  const rows = db
    .prepare(
      `SELECT pr.code, pr.name, pr.type, pr.country,
              (SELECT MAX(c.end_date)
                 FROM contracts c
                WHERE c.property_id = pr.id
                  AND c.status IN ('active','expired')
                  AND c.end_date < @today) AS last_occupied,
              CASE
                WHEN (SELECT MAX(c.end_date) FROM contracts c
                       WHERE c.property_id = pr.id
                         AND c.end_date < @today) IS NOT NULL
                THEN julianday(@today) - julianday(
                       (SELECT MAX(c.end_date) FROM contracts c
                         WHERE c.property_id = pr.id
                           AND c.end_date < @today)
                     )
                ELSE julianday(@today) - julianday(pr.created_at)
              END AS days_vacant
         FROM properties pr
        WHERE pr.is_archived = 0 AND pr.status = 'vacant' ${propertyFilter}
        ORDER BY days_vacant DESC
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  // Vacancy has no currency — wrap in a single synthetic group so the exporter's per-currency
  // loop has a consistent shape.
  return {
    titleKey: 'reports.type.vacancy',
    columns: VACANCY_COLUMNS,
    groups: [{ currency: '—', rows, totals: {} }]
  }
}

/* -------------------------------------------------------------------------- */
/* Report 5 — Financial Ledger (FR-REP-11, SRS §14.9)                         */
/* -------------------------------------------------------------------------- */

const LEDGER_COLUMNS: ReportColumn[] = [
  { key: 'entry_date', headerKey: 'reports.col.date', type: 'date' },
  { key: 'entry_type', headerKey: 'reports.col.entryType', type: 'text' },
  { key: 'description', headerKey: 'reports.col.description', type: 'text' },
  { key: 'debit', headerKey: 'reports.col.debit', type: 'currency', sumInTotals: true },
  { key: 'credit', headerKey: 'reports.col.credit', type: 'currency', sumInTotals: true },
  {
    key: 'running_balance',
    headerKey: 'reports.col.runningBalance',
    type: 'currency',
    isRunningBalance: true
  }
]

function buildLedgerReport(db: Database, filters: ReportFilters): ReportData {
  const propertyId = filters.ledger_property_id ?? filters.property_id
  if (!propertyId) {
    throw new ReportError('LEDGER_PROPERTY_REQUIRED')
  }

  const property = db
    .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
    .get(propertyId) as { currency: string } | undefined
  if (!property) throw new ReportError('PROPERTY_NOT_FOUND')

  // BR-22: reuse the canonical running-balance computation so the report and the Ledger screen
  // can never disagree on a balance.
  const rows = computeRunningBalances(db, propertyId, filters.from_date, filters.to_date).slice(
    0,
    REPORT_ROW_LIMIT
  ) as unknown as Record<string, unknown>[]

  const groups = groupByCurrency(rows, 'currency', ['debit', 'credit'])
  return {
    titleKey: 'reports.type.ledger',
    columns: LEDGER_COLUMNS,
    groups
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatcher                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build a report by type. All builders share the same shape, so the IPC layer can hand the
 * result straight to either exporter without per-type branching.
 */
export function buildReport(db: Database, type: ReportType, filters: ReportFilters): ReportData {
  // Touch langOf so the filter is acknowledged even when the builder doesn't itself branch on
  // language — the exporters consume `filters.language` directly via resolveLocaleKey.
  void langOf(filters)

  // Extended report types (6 through 11) live in reportServiceExtended.ts
  switch (type) {
    case 'income':
      return buildIncomeReport(db, filters)
    case 'expense':
      return buildExpenseReport(db, filters)
    case 'profit_loss':
      return buildProfitLossReport(db, filters)
    case 'vacancy':
      return buildVacancyReport(db, filters)
    case 'ledger':
      return buildLedgerReport(db, filters)
    default: {
      const builder = extendedBuilders[type]
      if (builder) return builder(db, filters)
      throw new ReportError(`UNKNOWN_REPORT_TYPE:${String(type)}`)
    }
  }
}
