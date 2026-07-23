/**
 * @file reportServiceExtended — 6 additional report builders (SRS §5.7, §14.4–§14.11).
 *
 * INTENT: Split from reportService.ts to stay under the 500-line limit.
 *         Each builder follows the identical pattern: define COLUMNS, write SQL, return ReportData.
 *
 * CONSTRAINTS: Same as reportService.ts — parameterized queries, REPORT_ROW_LIMIT bound,
 *              per-currency grouping via groupByCurrency, no string concatenation into SQL.
 */

import { Database } from 'better-sqlite3'
import { getReportingCurrency } from '../utils/currencyHelper'
import {
  type ReportData,
  type ReportColumn,
  type ExportLanguage,
  groupByCurrency,
  REPORT_ROW_LIMIT,
  resolveLocaleKey,
  tryResolveLocaleKey
} from './exportService/exportUtils'
import { type ReportFilters, dateRangeClause } from './reportService'

/** Resolve the language filter once, defaulting to Arabic (BR-30). */
function langOf(filters: ReportFilters): ExportLanguage {
  return filters.language === 'en' ? 'en' : 'ar'
}

/* -------------------------------------------------------------------------- */
/* Report 6 — Property Profitability (FR-REP-05, SRS §14.4)                  */
/* -------------------------------------------------------------------------- */

const PROP_PROFITABILITY_COLUMNS: ReportColumn[] = [
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

function buildPropertyProfitabilityReport(db: Database, filters: ReportFilters): ReportData {
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
             FROM payments p WHERE p.is_voided = 0 AND ${incomeCond}
             GROUP BY property_id
         ) income ON income.property_id = pr.id
         LEFT JOIN (
           SELECT property_id, SUM(amount) AS total_expense
             FROM expenses e WHERE e.is_voided = 0 AND ${expenseCond}
             GROUP BY property_id
         ) expense ON expense.property_id = pr.id
        WHERE pr.is_archived = 0 ${propertyFilter}
        ORDER BY pr.currency, net_profit DESC
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown> & { net_profit: number; total_income: number }>

  for (const row of rows) {
    const income = Number(row.total_income ?? 0)
    const net = Number(row.net_profit ?? 0)
    row['margin_percent'] = income > 0 ? Math.round((net / income) * 1000) / 10 : 0
  }

  const groups = groupByCurrency(rows, 'currency', ['total_income', 'total_expense', 'net_profit'])
  // Consolidated group: per-property sums in the reporting currency via frozen base_amount
  // snapshots. Same shape as the native rows so the same columns render.
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
             FROM payments p WHERE p.is_voided = 0 AND ${incomeCond}
             GROUP BY property_id
         ) income ON income.property_id = pr.id
         LEFT JOIN (
           SELECT property_id, SUM(COALESCE(base_amount, amount, 0)) AS total_expense
             FROM expenses e WHERE e.is_voided = 0 AND ${expenseCond}
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
    titleKey: 'reports.type.property_profitability',
    columns: PROP_PROFITABILITY_COLUMNS,
    groups,
    consolidatedGroup
  }
}

/* -------------------------------------------------------------------------- */
/* Report 7 — Tenant Payment History (FR-REP-06, SRS §14.5)                  */
/* -------------------------------------------------------------------------- */

const TENANT_PAYMENT_COLUMNS: ReportColumn[] = [
  { key: 'tenant_name', headerKey: 'reports.col.tenant', type: 'text' },
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  { key: 'total_due', headerKey: 'reports.col.totalDue', type: 'currency', sumInTotals: true },
  { key: 'total_paid', headerKey: 'reports.col.totalPaid', type: 'currency', sumInTotals: true },
  { key: 'remaining', headerKey: 'reports.col.remaining', type: 'currency', sumInTotals: true },
  { key: 'last_payment_date', headerKey: 'reports.col.lastPaymentDate', type: 'date' }
]

function buildTenantPaymentHistoryReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const payCond = dateRangeClause('p.payment_date', filters, params)
  const propertyFilter = filters.property_id ? 'AND c.property_id = @property_id' : ''
  const tenantFilter = filters.tenant_id ? 'AND c.tenant_id = @tenant_id' : ''
  if (filters.property_id) params.property_id = filters.property_id
  if (filters.tenant_id) params.tenant_id = filters.tenant_id

  const rows = db
    .prepare(
      `SELECT t.fullname AS tenant_name, pr.name AS property_name, pr.currency,
              COALESCE(payments.total_paid, 0) AS total_paid,
              COALESCE(c.rent_amount, 0) AS monthly_rent,
              (SELECT MAX(p2.payment_date) FROM payments p2
                WHERE p2.tenant_id = t.id AND p2.is_voided = 0) AS last_payment_date
         FROM tenants t
         JOIN contracts c ON c.tenant_id = t.id
         JOIN properties pr ON c.property_id = pr.id
         LEFT JOIN (
           SELECT tenant_id, property_id, SUM(amount) AS total_paid
             FROM payments WHERE is_voided = 0 AND ${payCond}
             GROUP BY tenant_id, property_id
         ) payments ON payments.tenant_id = t.id AND payments.property_id = pr.id
        WHERE c.status IN ('active', 'expired')
          ${propertyFilter}
          ${tenantFilter}
        ORDER BY t.fullname
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown> & { total_paid: number; monthly_rent: number }>

  for (const row of rows) {
    const totalDue = row.monthly_rent
    row['total_due'] = totalDue
    row['remaining'] = Math.max(0, totalDue - row.total_paid)
  }

  const groups = groupByCurrency(rows, 'currency', ['total_due', 'total_paid', 'remaining'])
  // DECISION: tenant_payment_history intentionally has NO consolidatedGroup. Only `total_paid`
  // has a frozen snapshot; `total_due` (contract monthly_rent) and `remaining` do not. Mixing
  // snapshot-converted payments with native rent would produce a half-converted, misleading
  // "remaining" value. The per-currency native tables remain the correct view for this report.
  return {
    titleKey: 'reports.type.tenant_payment_history',
    columns: TENANT_PAYMENT_COLUMNS,
    groups
  }
}

/* -------------------------------------------------------------------------- */
/* Report 8 — Outstanding Balances (FR-REP-07, SRS §14.6)                    */
/* -------------------------------------------------------------------------- */

const OUTSTANDING_COLUMNS: ReportColumn[] = [
  { key: 'tenant_name', headerKey: 'reports.col.tenant', type: 'text' },
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  { key: 'amount_due', headerKey: 'reports.col.amountDue', type: 'currency', sumInTotals: true },
  { key: 'days_overdue', headerKey: 'reports.col.daysOverdue', type: 'number' }
]

function buildOutstandingBalancesReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const today = new Date().toISOString().split('T')[0]
  params.today = today
  const propertyFilter = filters.property_id ? 'AND pr.id = @property_id' : ''
  if (filters.property_id) params.property_id = filters.property_id

  const rows = db
    .prepare(
      `SELECT t.fullname AS tenant_name, pr.name AS property_name, pr.currency,
              c.rent_amount AS amount_due,
              julianday(@today) - julianday(c.end_date) AS days_overdue
         FROM contracts c
         JOIN tenants t ON c.tenant_id = t.id
         JOIN properties pr ON c.property_id = pr.id
         WHERE c.status = 'active'
           ${propertyFilter}
           AND c.end_date < @today
         ORDER BY days_overdue DESC
         LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown> & { amount_due: number; days_overdue: number }>

  const groups = groupByCurrency(rows, 'currency', ['amount_due'])
  return { titleKey: 'reports.type.outstanding_balances', columns: OUTSTANDING_COLUMNS, groups }
}

/* -------------------------------------------------------------------------- */
/* Report 9 — Contract Expiration & Escalation (FR-REP-09, SRS §14.8)        */
/* -------------------------------------------------------------------------- */

const CONTRACT_EXPIRY_COLUMNS: ReportColumn[] = [
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'tenant_name', headerKey: 'reports.col.tenant', type: 'text' },
  { key: 'end_date', headerKey: 'reports.col.contractEnd', type: 'date' },
  { key: 'days_remaining', headerKey: 'reports.col.daysRemaining', type: 'number' },
  { key: 'current_rent', headerKey: 'reports.col.currentRent', type: 'currency' },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  { key: 'next_change', headerKey: 'reports.col.nextChange', type: 'text' }
]

function buildContractExpiryReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const today = new Date().toISOString().split('T')[0]
  params.today = today
  const propertyFilter = filters.property_id ? 'AND pr.id = @property_id' : ''
  if (filters.property_id) params.property_id = filters.property_id
  const lang = langOf(filters)

  const rows = db
    .prepare(
      `SELECT c.id, pr.name AS property_name, t.fullname AS tenant_name,
              c.end_date, c.rent_amount AS current_rent, pr.currency,
              CAST(julianday(c.end_date) - julianday(@today) AS INTEGER) AS days_remaining,
              CASE WHEN res.id IS NOT NULL THEN res.year_number ELSE NULL END AS escalation_year,
              CASE WHEN res.id IS NOT NULL THEN res.rent_amount ELSE NULL END AS escalation_rent,
              CASE WHEN res.id IS NOT NULL THEN res.effective_start_date ELSE NULL END AS escalation_date,
              c.annual_increase_percent,
              CASE WHEN res.id IS NOT NULL THEN 1 ELSE 0 END AS has_escalation
         FROM contracts c
         JOIN properties pr ON c.property_id = pr.id
         JOIN tenants t ON c.tenant_id = t.id
         LEFT JOIN rent_escalation_schedule res
           ON res.contract_id = c.id
           AND res.effective_start_date > @today
         WHERE c.status = 'active'
           ${propertyFilter}
         ORDER BY days_remaining ASC
         LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  for (const row of rows) {
    if (row.has_escalation) {
      row['next_change'] = resolveLocaleKey('reports.yearRow', lang, {
        year: Number(row.escalation_year),
        amount: Number(row.escalation_rent),
        currency: String(row.currency),
        date: String(row.escalation_date)
      })
    } else {
      row['next_change'] = resolveLocaleKey('reports.percentIncrease', lang, {
        percent: Number(row.annual_increase_percent)
      })
    }
  }

  const groups = groupByCurrency(rows, 'currency', ['current_rent'])
  return { titleKey: 'reports.type.contract_expiry', columns: CONTRACT_EXPIRY_COLUMNS, groups }
}

/* -------------------------------------------------------------------------- */
/* Report 10 — Recurring Expenses Schedule (FR-REP-12, SRS §14.10)           */
/* -------------------------------------------------------------------------- */

const RECURRING_SCHEDULE_COLUMNS: ReportColumn[] = [
  { key: 'template_name', headerKey: 'reports.col.templateName', type: 'text' },
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'category_key', headerKey: 'reports.col.category', type: 'text' },
  { key: 'vendor_name', headerKey: 'reports.col.vendor', type: 'text' },
  { key: 'amount', headerKey: 'reports.col.amount', type: 'currency', sumInTotals: true },
  { key: 'currency', headerKey: 'reports.col.currency', type: 'text' },
  { key: 'frequency', headerKey: 'reports.col.frequency', type: 'text' },
  { key: 'next_due_date', headerKey: 'reports.col.nextDueDate', type: 'date' },
  { key: 'is_active', headerKey: 'reports.col.status', type: 'text' }
]

function buildRecurringScheduleReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const propertyFilter = filters.property_id ? 'AND rt.property_id = @property_id' : ''
  if (filters.property_id) params.property_id = filters.property_id
  const lang = langOf(filters)

  const rows = db
    .prepare(
      `SELECT rt.name AS template_name, pr.name AS property_name,
              ec.name_key AS category_key, rt.vendor_name,
              rt.amount, rt.currency, rt.frequency, rt.next_due_date,
              CASE WHEN rt.is_active = 1 THEN 'active'
                   WHEN rt.end_date IS NOT NULL AND rt.end_date < date('now') THEN 'ended'
                   ELSE 'paused'
              END AS status_code
         FROM recurring_expense_templates rt
         LEFT JOIN properties pr ON rt.property_id = pr.id
         LEFT JOIN expense_categories ec ON rt.category_id = ec.id
         WHERE 1=1
           ${propertyFilter}
         ORDER BY rt.next_due_date ASC NULLS LAST
         LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  const statusMap: Record<string, string> = {
    active: resolveLocaleKey('reports.statusActive', lang),
    ended: resolveLocaleKey('reports.statusEnded', lang),
    paused: resolveLocaleKey('reports.statusPaused', lang)
  }
  for (const row of rows) {
    row['is_active'] = statusMap[String(row.status_code)] ?? String(row.status_code)
    row['category_key'] = tryResolveLocaleKey(String(row.category_key), lang)
    row['frequency'] = resolveLocaleKey(`reports.frequency.${row.frequency}`, lang)
  }

  const groups = groupByCurrency(rows, 'currency', ['amount'])
  return {
    titleKey: 'reports.type.recurring_schedule',
    columns: RECURRING_SCHEDULE_COLUMNS,
    groups
  }
}

/* -------------------------------------------------------------------------- */
/* Report 11 — Document Expiry (FR-REP-13, SRS §14.11)                       */
/* -------------------------------------------------------------------------- */

const DOCUMENT_EXPIRY_COLUMNS: ReportColumn[] = [
  { key: 'property_name', headerKey: 'reports.col.property', type: 'text' },
  { key: 'document_type', headerKey: 'reports.col.documentType', type: 'text' },
  { key: 'description', headerKey: 'reports.col.description', type: 'text' },
  { key: 'issue_date', headerKey: 'reports.col.issueDate', type: 'date' },
  { key: 'expiry_date', headerKey: 'reports.col.expiryDate', type: 'date' },
  { key: 'days_until_expiry', headerKey: 'reports.col.daysRemaining', type: 'number' },
  { key: 'status_label', headerKey: 'reports.col.status', type: 'text' }
]

function buildDocumentExpiryReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const today = new Date().toISOString().split('T')[0]
  params.today = today
  const propertyFilter = filters.property_id ? 'AND pr.id = @property_id' : ''
  if (filters.property_id) params.property_id = filters.property_id
  const lang = langOf(filters)

  const rows = db
    .prepare(
      `SELECT pr.name AS property_name,
              COALESCE(d.document_type, 'other') AS document_type,
              COALESCE(d.description, d.file_name) AS description,
              d.issue_date, d.expiry_date,
              CAST(julianday(d.expiry_date) - julianday(@today) AS INTEGER) AS days_until_expiry,
              CASE
                WHEN julianday(d.expiry_date) - julianday(@today) < 0 THEN 'expired'
                WHEN julianday(d.expiry_date) - julianday(@today) <= 30 THEN 'expiring_soon'
                ELSE 'valid'
              END AS status_code
         FROM documents d
         JOIN properties pr ON d.entity_type = 'property' AND d.entity_id = pr.id
         WHERE d.is_archived = 0 AND d.expiry_date IS NOT NULL
           ${propertyFilter}
         ORDER BY d.expiry_date ASC
         LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  const statusMap: Record<string, string> = {
    expired: resolveLocaleKey('reports.statusExpired', lang),
    expiring_soon: resolveLocaleKey('reports.statusExpiringSoon', lang),
    valid: resolveLocaleKey('reports.statusValid', lang)
  }
  for (const row of rows) {
    row['status_label'] = statusMap[String(row.status_code)] ?? String(row.status_code)
  }

  return {
    titleKey: 'reports.type.document_expiry',
    columns: DOCUMENT_EXPIRY_COLUMNS,
    groups: [{ currency: '—', rows, totals: {} }]
  }
}

/* -------------------------------------------------------------------------- */
/* Builder registry — maps report type string to builder function.            */
/* The main reportService's dispatcher delegates to these via the switch.     */
/* -------------------------------------------------------------------------- */

export const extendedBuilders: Record<
  string,
  (db: Database, filters: ReportFilters) => ReportData
> = {
  property_profitability: buildPropertyProfitabilityReport,
  tenant_payment_history: buildTenantPaymentHistoryReport,
  outstanding_balances: buildOutstandingBalancesReport,
  contract_expiry: buildContractExpiryReport,
  recurring_schedule: buildRecurringScheduleReport,
  document_expiry: buildDocumentExpiryReport
}
