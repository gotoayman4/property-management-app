/**
 * @file dashboardRepository — Database queries and aggregate metrics for the dashboard.
 * INTENT: Encapsulates SQL aggregations for property counts, tenant counts, active contracts,
 *         financial totals, upcoming due payments/expenses, expiring documents, and 12-month trends.
 */
import { Database } from 'better-sqlite3'
import { sumReportingSnapshot } from '../utils/currencyHelper'
import { toLocalISODate, addDays } from '../utils/dateUtils'

export interface CurrencyFinancialRow {
  currency: string
  income: number
  expenses: number
  netProfit: number
}

export interface ConsolidatedSummary {
  reporting_currency: string
  total_income: number
  total_expenses: number
  total_net_profit: number
}

export interface DashboardSummary {
  totalProperties: number
  rentedProperties: number
  totalTenants: number
  activeContracts: number
  financialSummary: CurrencyFinancialRow[]
  consolidatedSummary: ConsolidatedSummary
}

export function whereCountry(country: string | undefined): {
  clause: string
  params: (string | number)[]
} {
  if (!country) return { clause: '', params: [] }
  return { clause: ' AND (pr.country = ? OR pr.country IS NULL)', params: [country] }
}

export function getDashboardSummary(db: Database, country?: string): DashboardSummary {
  const totalProperties = country
    ? (
        db
          .prepare('SELECT COUNT(*) as cnt FROM properties WHERE is_archived = 0 AND country = ?')
          .get(country) as { cnt: number }
      ).cnt
    : (
        db.prepare('SELECT COUNT(*) as cnt FROM properties WHERE is_archived = 0').get() as {
          cnt: number
        }
      ).cnt

  const rentedProperties = country
    ? (
        db
          .prepare(
            "SELECT COUNT(*) as cnt FROM properties WHERE is_archived = 0 AND status = 'rented' AND country = ?"
          )
          .get(country) as { cnt: number }
      ).cnt
    : (
        db
          .prepare(
            "SELECT COUNT(*) as cnt FROM properties WHERE is_archived = 0 AND status = 'rented'"
          )
          .get() as { cnt: number }
      ).cnt

  const totalTenants = (
    db.prepare('SELECT COUNT(*) as cnt FROM tenants WHERE is_active = 1').get() as {
      cnt: number
    }
  ).cnt

  const activeContracts = country
    ? (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM contracts c
             JOIN properties p ON c.property_id = p.id
             WHERE c.status = 'active' AND p.country = ?`
          )
          .get(country) as { cnt: number }
      ).cnt
    : (
        db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'active'").get() as {
          cnt: number
        }
      ).cnt

  const wc = whereCountry(country)
  const currentMonth = (() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  })()

  const incomeRows = db
    .prepare(
      `SELECT pay.currency, COALESCE(SUM(pay.amount), 0) as income
       FROM payments pay
       LEFT JOIN properties pr ON pay.property_id = pr.id
       WHERE pay.is_voided = 0
         AND strftime('%Y-%m', pay.payment_date) = ?${wc.clause}
       GROUP BY pay.currency`
    )
    .all(currentMonth, ...wc.params) as { currency: string; income: number }[]

  const expenseRows = db
    .prepare(
      `SELECT e.currency, COALESCE(SUM(e.amount), 0) as expenses
       FROM expenses e
       LEFT JOIN properties pr ON e.property_id = pr.id
       WHERE e.is_voided = 0
         AND strftime('%Y-%m', e.expense_date) = ?${wc.clause}
       GROUP BY e.currency`
    )
    .all(currentMonth, ...wc.params) as { currency: string; expenses: number }[]

  const currencyMap = new Map<string, CurrencyFinancialRow>()
  for (const r of incomeRows) {
    currencyMap.set(r.currency, {
      currency: r.currency,
      income: r.income,
      expenses: 0,
      netProfit: 0
    })
  }
  for (const r of expenseRows) {
    const existing = currencyMap.get(r.currency)
    if (existing) {
      existing.expenses = r.expenses
    } else {
      currencyMap.set(r.currency, {
        currency: r.currency,
        income: 0,
        expenses: r.expenses,
        netProfit: 0
      })
    }
  }
  const financialSummary: CurrencyFinancialRow[] = Array.from(currencyMap.values()).map((row) => ({
    ...row,
    netProfit: row.income - row.expenses
  }))

  const countryClause = country ? ' AND (pr.country = @country OR pr.country IS NULL)' : ''
  const snapshotParams: Record<string, unknown> = { currentMonth }
  if (country) snapshotParams.country = country

  const incomeSnap = sumReportingSnapshot(db, {
    table: 'payments',
    dateColumn: 'payment_date',
    join: 'LEFT JOIN properties pr ON payments.property_id = pr.id',
    extraWhere: `strftime('%Y-%m', payments.payment_date) = @currentMonth${countryClause}`,
    params: snapshotParams
  })
  const expenseSnap = sumReportingSnapshot(db, {
    table: 'expenses',
    dateColumn: 'expense_date',
    join: 'LEFT JOIN properties pr ON expenses.property_id = pr.id',
    extraWhere: `strftime('%Y-%m', expenses.expense_date) = @currentMonth${countryClause}`,
    params: snapshotParams
  })

  const consolidatedSummary: ConsolidatedSummary = {
    reporting_currency: incomeSnap.currency,
    total_income: incomeSnap.total,
    total_expenses: expenseSnap.total,
    total_net_profit: incomeSnap.total - expenseSnap.total
  }

  return {
    totalProperties,
    rentedProperties,
    totalTenants,
    activeContracts,
    financialSummary,
    consolidatedSummary
  }
}

export function getRecentPayments(db: Database, country?: string): unknown[] {
  const wc = whereCountry(country)
  return db
    .prepare(
      `SELECT p.id, p.payment_date, p.amount, p.currency, p.payment_type, p.receipt_number,
              p.base_amount, p.reporting_currency,
              pr.name as property_name, t.fullname as tenant_name
       FROM payments p
       LEFT JOIN properties pr ON p.property_id = pr.id
       LEFT JOIN tenants t ON p.tenant_id = t.id
       WHERE p.is_voided = 0${wc.clause}
       ORDER BY p.payment_date DESC, p.id DESC
       LIMIT 5`
    )
    .all(...wc.params)
}

export function getRecentExpenses(db: Database, country?: string): unknown[] {
  const wc = whereCountry(country)
  return db
    .prepare(
      `SELECT e.id, e.expense_date, e.amount, e.currency, e.vendor_name,
              e.base_amount, e.reporting_currency,
              ec.name_key as category_key, pr.name as property_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       LEFT JOIN properties pr ON e.property_id = pr.id
       WHERE e.is_voided = 0${wc.clause}
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT 5`
    )
    .all(...wc.params)
}

export function getRecentActivities(db: Database, country?: string): unknown[] {
  const prClause = country ? ' WHERE pr.country = ?' : ''
  const propClause = country ? ' WHERE country = ?' : ''

  const query = `
    SELECT * FROM (
      SELECT p.id, 'payment' as entity_type, p.payment_date as activity_date,
             p.amount, p.currency, p.base_amount, p.reporting_currency,
             pr.name as property_name,
             NULL as contract_number, NULL as entity_name, NULL as entity_code, p.created_at
      FROM payments p
      JOIN properties pr ON p.property_id = pr.id
      ${country ? 'WHERE pr.country = ? AND p.is_voided = 0' : 'WHERE p.is_voided = 0'}
      UNION ALL
      SELECT e.id, 'expense' as entity_type, e.expense_date as activity_date,
             e.amount, e.currency, e.base_amount, e.reporting_currency, COALESCE(pr.name, '') as property_name,
             NULL as contract_number, NULL as entity_name, NULL as entity_code, e.created_at
      FROM expenses e
      LEFT JOIN properties pr ON e.property_id = pr.id
      ${country ? 'WHERE (pr.country = ? OR e.property_id IS NULL) AND e.is_voided = 0' : 'WHERE e.is_voided = 0'}
      UNION ALL
      SELECT c.id, 'contract' as entity_type, c.start_date as activity_date,
             NULL as amount, NULL as currency, NULL as base_amount, NULL as reporting_currency,
             pr.name as property_name,
             c.contract_number, NULL as entity_name, NULL as entity_code, c.created_at
      FROM contracts c
      JOIN properties pr ON c.property_id = pr.id
      ${prClause}
      UNION ALL
      SELECT id, 'property' as entity_type, substr(created_at, 1, 10) as activity_date,
             NULL as amount, NULL as currency, NULL as base_amount, NULL as reporting_currency,
             NULL as property_name,
             NULL as contract_number, name as entity_name, code as entity_code, created_at
      FROM properties
      ${propClause}
      UNION ALL
      SELECT id, 'tenant' as entity_type, substr(created_at, 1, 10) as activity_date,
             NULL as amount, NULL as currency, NULL as base_amount, NULL as reporting_currency,
             NULL as property_name,
             NULL as contract_number, fullname as entity_name, code as entity_code, created_at
      FROM tenants
    ) ORDER BY created_at DESC LIMIT 10
  `
  return db.prepare(query).all(...(country ? [country, country, country, country] : []))
}

export function getUpcomingDue(db: Database, country?: string): unknown[] {
  const clause = country ? ' AND p.country = ?' : ''
  const params: unknown[] = country ? [country] : []
  return db
    .prepare(
      `SELECT c.id, c.rent_amount, c.currency, p.name as property_name,
              t.fullname as tenant_name, c.end_date
       FROM contracts c
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active'${clause}
       ORDER BY c.end_date ASC
       LIMIT 10`
    )
    .all(...params)
}

/**
 * Overdue = real arrears from rent_dues (status pending/partial with a due_date in the past),
 * aggregated per contract. Replaces the old contract-end-date proxy: this reflects true
 * period-level debt (outstanding = amount_due - amount_paid) summed across every open past-due
 * period, with the count of overdue periods and the oldest such due_date.
 */
export function getOverduePayments(db: Database, country?: string): unknown[] {
  const wc = whereCountry(country)
  const today = toLocalISODate(new Date())
  return db
    .prepare(
      `SELECT d.contract_id AS id,
              MIN(d.due_date) AS due_date,
              SUM(d.amount_due - d.amount_paid) AS amount,
              d.currency,
              pr.name AS property_name,
              t.fullname AS tenant_name,
              COUNT(*) AS months_overdue
       FROM rent_dues d
       JOIN properties pr ON d.property_id = pr.id
       JOIN contracts c ON d.contract_id = c.id
       LEFT JOIN tenants t ON d.tenant_id = t.id
       WHERE d.status IN ('pending', 'partial') AND d.due_date < ?${wc.clause}
       GROUP BY d.contract_id, d.currency, pr.name, t.fullname
       ORDER BY MIN(d.due_date) ASC
       LIMIT 10`
    )
    .all(today, ...wc.params)
}

export function getUpcomingRecurring(db: Database, country?: string): unknown[] {
  const today = toLocalISODate(new Date())
  const in7Days = addDays(new Date(), 7)
  const wc = whereCountry(country)
  return db
    .prepare(
      `SELECT rt.id, rt.name, rt.amount, rt.currency, rt.frequency, rt.next_due_date,
              pr.name as property_name, ec.name_key as category_key
       FROM recurring_expense_templates rt
       LEFT JOIN properties pr ON rt.property_id = pr.id
       LEFT JOIN expense_categories ec ON rt.category_id = ec.id
       WHERE rt.is_active = 1
         AND rt.next_due_date IS NOT NULL
         AND rt.next_due_date <= ?
         AND (rt.end_date IS NULL OR rt.end_date >= ?)${wc.clause}
       ORDER BY rt.next_due_date ASC
       LIMIT 10`
    )
    .all(in7Days, today, ...wc.params)
}

export function getExpiringDocuments(db: Database, country?: string): unknown[] {
  const today = toLocalISODate(new Date())
  const in30Days = addDays(new Date(), 30)
  const clause = country ? ' AND pr.country = ?' : ''
  const params: (string | number)[] = country ? [today, in30Days, country] : [today, in30Days]
  return db
    .prepare(
      `SELECT d.id, d.file_name, d.document_type, d.expiry_date, d.issue_date,
              pr.name as property_name
       FROM documents d
       JOIN properties pr ON d.entity_type = 'property' AND d.entity_id = pr.id
       WHERE d.is_archived = 0
         AND d.expiry_date IS NOT NULL
         AND d.expiry_date BETWEEN ? AND ?${clause}
       ORDER BY d.expiry_date ASC
       LIMIT 10`
    )
    .all(...params)
}

export function getFinancialTrends(
  db: Database,
  country?: string
): { income: unknown[]; expense: unknown[]; startDate: string; endDate: string } {
  const today = new Date()
  const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1)
  const startDate = toLocalISODate(twelveMonthsAgo)
  const endDate = toLocalISODate(today)

  const incomeClause = country ? ' AND p.country = ?' : ''
  const incomeParams: (string | number)[] = country
    ? [startDate, endDate, country]
    : [startDate, endDate]

  const income = db
    .prepare(
      `SELECT strftime('%Y-%m', pay.payment_date) as month,
              SUM(pay.amount) as total, pay.currency
       FROM payments pay
       LEFT JOIN properties p ON pay.property_id = p.id
       WHERE pay.is_voided = 0 AND pay.payment_date >= ? AND pay.payment_date <= ?${incomeClause}
       GROUP BY month, pay.currency
       ORDER BY month ASC`
    )
    .all(...incomeParams)

  const expenseClause = country ? ' AND p.country = ?' : ''
  const expenseParams: (string | number)[] = country
    ? [startDate, endDate, country]
    : [startDate, endDate]

  const expense = db
    .prepare(
      `SELECT strftime('%Y-%m', e.expense_date) as month,
              SUM(e.amount) as total, e.currency
       FROM expenses e
       LEFT JOIN properties p ON e.property_id = p.id
       WHERE e.is_voided = 0 AND e.expense_date >= ? AND e.expense_date <= ?${expenseClause}
       GROUP BY month, e.currency
       ORDER BY month ASC`
    )
    .all(...expenseParams)

  return { income, expense, startDate, endDate }
}
