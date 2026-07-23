/**
 * @file reportQueries — Core SQL report builders for income, expense, P&L, vacancy, and ledger.
 * INTENT: Encapsulates SQL data queries and formatting logic for the primary report types.
 */
import { Database } from 'better-sqlite3'
import { computeRunningBalances } from '../db/ledgerService'
import {
  sumReportingSnapshot,
  formatConsolidatedSnapshotNote,
  computeConsolidatedNote,
  getReportingCurrency
} from '../utils/currencyHelper'
import {
  type ReportData,
  type ReportColumn,
  groupByCurrency,
  buildConsolidatedGroup,
  REPORT_ROW_LIMIT,
  resolveLocaleKey,
  tryResolveLocaleKey
} from './exportService/exportUtils'

export type ReportType =
  | 'income'
  | 'expense'
  | 'profit_loss'
  | 'vacancy'
  | 'rent_roll'
  | 'tenant_statement'
  | 'property_statement'
  | 'deposit'
  | 'tax_summary'
  | 'overdue'
  | 'ledger'
  | 'property_profitability'
  | 'tenant_payment_history'
  | 'outstanding_balances'
  | 'contract_expiry'
  | 'recurring_schedule'
  | 'document_expiry'

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

export class ReportError extends Error {
  constructor(public code: string) {
    super(code)
    this.name = 'ReportError'
  }
}

export function langOf(filters: ReportFilters): 'ar' | 'en' {
  return filters.language === 'en' ? 'en' : 'ar'
}

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

/* Income Report */
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

export function buildIncomeReport(db: Database, filters: ReportFilters): ReportData {
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
  const lang = langOf(filters)

  const rows = db
    .prepare(
      `SELECT p.payment_date, p.receipt_number, p.amount, p.currency, p.payment_type, p.payment_method,
              p.base_amount, p.reporting_currency,
              pr.name AS property_name, t.fullname AS tenant_name
         FROM payments p
         LEFT JOIN properties pr ON p.property_id = pr.id
         LEFT JOIN tenants t ON p.tenant_id = t.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.payment_date DESC, p.id DESC
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  const paymentTypeMap: Record<string, string> = {
    rent: resolveLocaleKey('payment.rent', lang),
    deposit: resolveLocaleKey('payment.deposit', lang),
    other_income: resolveLocaleKey('payment.otherIncome', lang)
  }
  const paymentMethodMap: Record<string, string> = {
    cash: resolveLocaleKey('payment.methodCash', lang),
    bank_transfer: resolveLocaleKey('payment.methodBank', lang),
    cheque: resolveLocaleKey('payment.methodCheque', lang),
    other: resolveLocaleKey('payment.methodOther', lang)
  }
  for (const row of rows) {
    row['payment_type'] = paymentTypeMap[String(row['payment_type'])] ?? String(row['payment_type'])
    row['payment_method'] =
      paymentMethodMap[String(row['payment_method'])] ?? String(row['payment_method'])
  }

  const groups = groupByCurrency(rows, 'currency', ['amount'])
  return {
    titleKey: 'reports.type.income',
    columns: INCOME_COLUMNS,
    groups,
    consolidatedGroup: buildConsolidatedGroup(rows, getReportingCurrency(db), 'amount')
  }
}

/* Expense Report */
const EXPENSE_COLUMNS: ReportColumn[] = [
  { key: 'expense_date', headerKey: 'reports.col.date', type: 'date' },
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  { key: 'category_key', headerKey: 'reports.col.category', type: 'text' },
  { key: 'vendor_name', headerKey: 'reports.col.vendor', type: 'text' },
  { key: 'amount', headerKey: 'reports.col.amount', type: 'currency', sumInTotals: true }
]

export function buildExpenseReport(db: Database, filters: ReportFilters): ReportData {
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
  const lang = langOf(filters)

  const rows = db
    .prepare(
      `SELECT e.expense_date, e.amount, e.currency, e.vendor_name,
              e.base_amount, e.reporting_currency,
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

  for (const row of rows) {
    row['category_key'] = tryResolveLocaleKey(String(row['category_key']), lang)
  }

  const groups = groupByCurrency(rows, 'currency', ['amount'])
  return {
    titleKey: 'reports.type.expense',
    columns: EXPENSE_COLUMNS,
    groups,
    consolidatedGroup: buildConsolidatedGroup(rows, getReportingCurrency(db), 'amount')
  }
}

/* Profit Loss Report */
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

export function buildProfitLossReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const incomeCond = dateRangeClause('p.payment_date', filters, params)
  const expenseCond = dateRangeClause('e.expense_date', filters, params)
  if (filters.property_id) params.property_id = filters.property_id
  const propertyFilter = filters.property_id ? 'AND pr.id = @property_id' : ''

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
        WHERE pr.is_archived = 0 ${propertyFilter}
        ORDER BY pr.currency, pr.name
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown> & { net_profit: number; total_income: number }>

  for (const row of rows) {
    const income = Number(row.total_income ?? 0)
    const net = Number(row.net_profit ?? 0)
    row['margin_percent'] = income > 0 ? Math.round((net / income) * 1000) / 10 : 0
  }

  const groups = groupByCurrency(rows, 'currency', ['total_income', 'total_expense', 'net_profit'])
  const incomeSnap = sumReportingSnapshot(db, {
    table: 'payments',
    dateColumn: 'payment_date',
    fromDate: filters.from_date,
    toDate: filters.to_date,
    extraWhere: filters.property_id ? 'payments.property_id = @property_id' : undefined,
    params: filters.property_id ? { property_id: filters.property_id } : undefined
  })
  const expenseSnap = sumReportingSnapshot(db, {
    table: 'expenses',
    dateColumn: 'expense_date',
    fromDate: filters.from_date,
    toDate: filters.to_date,
    extraWhere: filters.property_id ? 'expenses.property_id = @property_id' : undefined,
    params: filters.property_id ? { property_id: filters.property_id } : undefined
  })
  const consolidatedNote =
    groups.length > 1
      ? formatConsolidatedSnapshotNote(
          {
            total: incomeSnap.total - expenseSnap.total,
            currency: incomeSnap.currency,
            unconvertedCurrencies: Array.from(
              new Set([...incomeSnap.unconvertedCurrencies, ...expenseSnap.unconvertedCurrencies])
            )
          },
          langOf(filters)
        )
      : computeConsolidatedNote(db, groups, 'net_profit', { lang: langOf(filters) })

  const reportingCurrency = getReportingCurrency(db)
  const consolidatedRows = db
    .prepare(
      `SELECT pr.id, pr.name AS property_name, pr.country,
              '${reportingCurrency}' AS currency,
              COALESCE(income.total_income, 0) AS total_income,
              COALESCE(expense.total_expense, 0) AS total_expense,
              (COALESCE(income.total_income, 0) - COALESCE(expense.total_expense, 0)) AS net_profit,
              '${reportingCurrency}' AS reporting_currency
         FROM properties pr
         LEFT JOIN (
           SELECT property_id, SUM(COALESCE(base_amount, amount, 0)) AS total_income
             FROM payments p
            WHERE p.is_voided = 0 AND ${incomeCond}
            GROUP BY property_id
         ) income ON income.property_id = pr.id
         LEFT JOIN (
           SELECT property_id, SUM(COALESCE(base_amount, amount, 0)) AS total_expense
             FROM expenses e
            WHERE e.is_voided = 0 AND ${expenseCond}
            GROUP BY property_id
         ) expense ON expense.property_id = pr.id
         WHERE pr.is_archived = 0 ${propertyFilter}
        ORDER BY net_profit DESC
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown>>
  for (const row of consolidatedRows) {
    const income = Number(row.total_income ?? 0)
    const net = Number(row.net_profit ?? 0)
    row['margin_percent'] = income > 0 ? Math.round((net / income) * 1000) / 10 : 0
  }

  const hasMultiCurrency = rows.some((r) => r['currency'] !== reportingCurrency)
  const consolidatedGroup = hasMultiCurrency
    ? {
        currency: reportingCurrency,
        rows: consolidatedRows,
        totals: {
          total_income: consolidatedRows.reduce((s, r) => s + Number(r.total_income ?? 0), 0),
          total_expense: consolidatedRows.reduce((s, r) => s + Number(r.total_expense ?? 0), 0),
          net_profit: consolidatedRows.reduce((s, r) => s + Number(r.net_profit ?? 0), 0)
        }
      }
    : undefined

  return {
    titleKey: 'reports.type.profit_loss',
    columns: PNL_COLUMNS,
    groups,
    consolidatedNote,
    consolidatedGroup
  }
}

/* Vacancy Report */
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

export function buildVacancyReport(db: Database, filters: ReportFilters): ReportData {
  const today = toLocalISODate(new Date())
  const params: Record<string, unknown> = { today }
  const propertyFilter = filters.property_id ? 'AND pr.id = @property_id' : ''
  if (filters.property_id) params.property_id = filters.property_id
  const lang = langOf(filters)

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

  const propertyTypeMap: Record<string, string> = {
    apartment: resolveLocaleKey('property.apartment', lang),
    shop: resolveLocaleKey('property.shop', lang)
  }
  for (const row of rows) {
    row['type'] = propertyTypeMap[String(row['type'])] ?? String(row['type'])
  }

  return {
    titleKey: 'reports.type.vacancy',
    columns: VACANCY_COLUMNS,
    groups: [{ currency: '—', rows, totals: {} }]
  }
}

/* Ledger Report */
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

export function buildLedgerReport(db: Database, filters: ReportFilters): ReportData {
  const propertyId = filters.ledger_property_id ?? filters.property_id
  if (!propertyId) {
    throw new ReportError('LEDGER_PROPERTY_REQUIRED')
  }

  const property = db
    .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
    .get(propertyId) as { currency: string } | undefined
  if (!property) throw new ReportError('PROPERTY_NOT_FOUND')

  const rows = computeRunningBalances(
    db,
    propertyId,
    filters.from_date,
    filters.to_date,
    langOf(filters)
  ).slice(0, REPORT_ROW_LIMIT) as unknown as Record<string, unknown>[]

  const groups = groupByCurrency(rows, 'currency', ['debit', 'credit'])
  return {
    titleKey: 'reports.type.ledger',
    columns: LEDGER_COLUMNS,
    groups
  }
}
