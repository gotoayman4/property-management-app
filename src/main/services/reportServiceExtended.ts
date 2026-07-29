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
  // Dues-driven: total_due/total_paid come from the materialized rent_dues schedule (real
  // receivables incl. backdated periods), NOT a single month's contract rent. Date range applies
  // to the due period (d.due_date) so historical arrears are captured accurately.
  const dueCond = dateRangeClause('d.due_date', filters, params)
  const propertyFilter = filters.property_id ? 'AND d.property_id = @property_id' : ''
  const tenantFilter = filters.tenant_id ? 'AND d.tenant_id = @tenant_id' : ''
  if (filters.property_id) params.property_id = filters.property_id
  if (filters.tenant_id) params.tenant_id = filters.tenant_id

  const rows = db
    .prepare(
      `SELECT t.fullname AS tenant_name, pr.name AS property_name, pr.currency,
              SUM(d.amount_due) AS total_due,
              SUM(d.amount_paid) AS total_paid,
              (SELECT MAX(p2.payment_date) FROM payments p2
                WHERE p2.tenant_id = t.id AND p2.is_voided = 0) AS last_payment_date
         FROM rent_dues d
         JOIN contracts c ON d.contract_id = c.id
         JOIN tenants t ON d.tenant_id = t.id
         JOIN properties pr ON d.property_id = pr.id
        WHERE ${dueCond}
          ${propertyFilter}
          ${tenantFilter}
        GROUP BY t.id, pr.id, pr.currency
        ORDER BY t.fullname
        LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown> & { total_due: number; total_paid: number }>

  for (const row of rows) {
    row['remaining'] = Math.max(0, Number(row.total_due ?? 0) - Number(row.total_paid ?? 0))
  }

  const groups = groupByCurrency(rows, 'currency', ['total_due', 'total_paid', 'remaining'])
  // DECISION: tenant_payment_history intentionally has NO consolidatedGroup. rent_dues carry no
  // frozen base_amount snapshot, so cross-currency consolidation would be misleading. The
  // per-currency native tables remain the correct view for this report.
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
  { key: 'days_overdue', headerKey: 'reports.col.daysOverdue', type: 'number' },
  { key: 'aging_0_30', headerKey: 'reports.col.aging0_30', type: 'currency', sumInTotals: true },
  { key: 'aging_31_60', headerKey: 'reports.col.aging31_60', type: 'currency', sumInTotals: true },
  { key: 'aging_61_90', headerKey: 'reports.col.aging61_90', type: 'currency', sumInTotals: true },
  {
    key: 'aging_90_plus',
    headerKey: 'reports.col.aging90Plus',
    type: 'currency',
    sumInTotals: true
  }
]

function buildOutstandingBalancesReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const today = new Date().toISOString().split('T')[0]
  params.today = today
  const propertyFilter = filters.property_id ? 'AND d.property_id = @property_id' : ''
  if (filters.property_id) params.property_id = filters.property_id

  // Real arrears: sum outstanding (amount_due - amount_paid) of every still-open past-due due,
  // grouped per tenant/property/currency, with a true days_overdue (today - oldest open due_date)
  // and standard aging buckets by each due's age. Replaces the old c.end_date proxy (which only
  // ever surfaced a single month of rent at contract end).
  const age = 'julianday(@today) - julianday(d.due_date)'
  const out = 'd.amount_due - d.amount_paid'
  const rows = db
    .prepare(
      `SELECT t.fullname AS tenant_name, pr.name AS property_name, pr.currency,
              SUM(${out}) AS amount_due,
              CAST(julianday(@today) - julianday(MIN(d.due_date)) AS INTEGER) AS days_overdue,
              SUM(CASE WHEN ${age} <= 30 THEN ${out} ELSE 0 END) AS aging_0_30,
              SUM(CASE WHEN ${age} > 30 AND ${age} <= 60 THEN ${out} ELSE 0 END) AS aging_31_60,
              SUM(CASE WHEN ${age} > 60 AND ${age} <= 90 THEN ${out} ELSE 0 END) AS aging_61_90,
              SUM(CASE WHEN ${age} > 90 THEN ${out} ELSE 0 END) AS aging_90_plus
         FROM rent_dues d
         JOIN contracts c ON d.contract_id = c.id
         JOIN tenants t ON d.tenant_id = t.id
         JOIN properties pr ON d.property_id = pr.id
         WHERE d.status IN ('pending', 'partial')
           AND d.due_date < @today
           ${propertyFilter}
         GROUP BY t.id, pr.id, pr.currency
         ORDER BY days_overdue DESC
         LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Array<Record<string, unknown> & { amount_due: number; days_overdue: number }>

  const groups = groupByCurrency(rows, 'currency', [
    'amount_due',
    'aging_0_30',
    'aging_31_60',
    'aging_61_90',
    'aging_90_plus'
  ])
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
/* Report 12 — Dues Schedule (rent_dues per-period ledger)                    */
/* -------------------------------------------------------------------------- */

const DUES_SCHEDULE_COLUMNS: ReportColumn[] = [
  { key: 'period', headerKey: 'reports.col.period', type: 'text' },
  { key: 'due_date', headerKey: 'reports.col.dueDate', type: 'date' },
  { key: 'amount_due', headerKey: 'reports.col.amountDue', type: 'currency', sumInTotals: true },
  { key: 'amount_paid', headerKey: 'reports.col.amountPaid', type: 'currency', sumInTotals: true },
  { key: 'outstanding', headerKey: 'reports.col.outstanding', type: 'currency', sumInTotals: true },
  { key: 'status', headerKey: 'reports.col.status', type: 'text' }
]

function buildDuesScheduleReport(db: Database, filters: ReportFilters): ReportData {
  const params: Record<string, unknown> = {}
  const dueCond = dateRangeClause('d.due_date', filters, params)
  const propertyFilter = filters.property_id ? 'AND d.property_id = @property_id' : ''
  const tenantFilter = filters.tenant_id ? 'AND d.tenant_id = @tenant_id' : ''
  if (filters.property_id) params.property_id = filters.property_id
  if (filters.tenant_id) params.tenant_id = filters.tenant_id
  const lang = langOf(filters)

  const rows = db
    .prepare(
      `SELECT pr.currency, d.period_key AS period, d.due_date,
              d.amount_due, d.amount_paid,
              (d.amount_due - d.amount_paid) AS outstanding,
              d.status AS status_code
         FROM rent_dues d
         JOIN contracts c ON d.contract_id = c.id
         JOIN properties pr ON d.property_id = pr.id
         WHERE ${dueCond}
           ${propertyFilter}
           ${tenantFilter}
         ORDER BY d.due_date ASC
         LIMIT ${REPORT_ROW_LIMIT + 1}`
    )
    .all(params) as Record<string, unknown>[]

  for (const row of rows) {
    row['status'] = resolveLocaleKey(`reports.duesStatus.${row.status_code}`, lang)
  }

  const groups = groupByCurrency(rows, 'currency', ['amount_due', 'amount_paid', 'outstanding'])
  return { titleKey: 'reports.type.dues_schedule', columns: DUES_SCHEDULE_COLUMNS, groups }
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
  document_expiry: buildDocumentExpiryReport,
  dues_schedule: buildDuesScheduleReport
}
