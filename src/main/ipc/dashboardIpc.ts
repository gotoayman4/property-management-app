/**
 * INTENT: Dashboard summary IPC — returns aggregate counts and totals for the
 *         landing page StatCards and dashboard lists: upcoming due, overdue,
 *         recurring expenses, expiring documents, and 12-month trends.
 *         All handlers accept an optional country filter (FR-DASH-00).
 * CONSTRAINT: property_id can be NULL in payments/expenses (general items);
 *             handle NULLs in joins and country filtering.
 */
import { ipcMain } from 'electron'
import { db } from '../db/database'

interface DashboardSummary {
  totalProperties: number
  rentedProperties: number
  totalTenants: number
  activeContracts: number
  totalPayments: number
  totalExpenses: number
  netBalance: number
}

/** Format a Date to YYYY-MM-DD using local timezone. */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Add N days to a date and return as YYYY-MM-DD. */
function addDays(d: Date, n: number): string {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return toLocalISODate(r)
}

/**
 * Build a parameterized country filter clause for queries that join `properties pr`.
 * When country is null/undefined, the clause is empty (no filtering).
 * When country is set, it filters by pr.country while preserving NULL property_id (general items).
 */
function whereCountry(country: string | undefined): {
  clause: string
  params: (string | number)[]
} {
  if (!country) return { clause: '', params: [] }
  return { clause: ' AND (pr.country = ? OR pr.country IS NULL)', params: [country] }
}

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle('dashboard:summary', async (_, country?: string) => {
    try {
      const totalProperties = country
        ? (
            db
              .prepare(
                'SELECT COUNT(*) as cnt FROM properties WHERE is_archived = 0 AND country = ?'
              )
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
      const totalPayments = (
        db
          .prepare(
            `SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p
             LEFT JOIN properties pr ON p.property_id = pr.id
             WHERE p.is_voided = 0${wc.clause}`
          )
          .get(...wc.params) as { total: number }
      ).total

      const totalExpenses = (
        db
          .prepare(
            `SELECT COALESCE(SUM(e.amount), 0) as total FROM expenses e
             LEFT JOIN properties pr ON e.property_id = pr.id
             WHERE e.is_voided = 0${wc.clause}`
          )
          .get(...wc.params) as { total: number }
      ).total

      const netBalance = totalPayments - totalExpenses

      return {
        totalProperties,
        rentedProperties,
        totalTenants,
        activeContracts,
        totalPayments,
        totalExpenses,
        netBalance
      } satisfies DashboardSummary
    } catch {
      throw new Error('FAILED_TO_LOAD_DASHBOARD')
    }
  })

  ipcMain.handle('dashboard:recentPayments', async (_, country?: string) => {
    try {
      const wc = whereCountry(country)
      return db
        .prepare(
          `SELECT p.id, p.payment_date, p.amount, p.currency, p.payment_type, p.receipt_number,
                  pr.name as property_name, t.fullname as tenant_name
           FROM payments p
           LEFT JOIN properties pr ON p.property_id = pr.id
           LEFT JOIN tenants t ON p.tenant_id = t.id
           WHERE p.is_voided = 0${wc.clause}
           ORDER BY p.payment_date DESC, p.id DESC
           LIMIT 5`
        )
        .all(...wc.params)
    } catch {
      throw new Error('FAILED_TO_LOAD_RECENT_PAYMENTS')
    }
  })

  ipcMain.handle('dashboard:recentExpenses', async (_, country?: string) => {
    try {
      const wc = whereCountry(country)
      return db
        .prepare(
          `SELECT e.id, e.expense_date, e.amount, e.currency, e.vendor_name,
                  ec.name_key as category_key, pr.name as property_name
           FROM expenses e
           LEFT JOIN expense_categories ec ON e.category_id = ec.id
           LEFT JOIN properties pr ON e.property_id = pr.id
           WHERE e.is_voided = 0${wc.clause}
           ORDER BY e.expense_date DESC, e.id DESC
           LIMIT 5`
        )
        .all(...wc.params)
    } catch {
      throw new Error('FAILED_TO_LOAD_RECENT_EXPENSES')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-04: Upcoming rent due in the next 7 days                    */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:upcomingDue', async (_, country?: string) => {
    try {
      // upcomingDue joins properties as `p` (not `pr`), so inline the clause.
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
    } catch {
      throw new Error('FAILED_TO_LOAD_UPCOMING_DUE')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-05: Overdue payments sorted oldest first                    */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:overdue', async (_, country?: string) => {
    try {
      const wc = whereCountry(country)
      return db
        .prepare(
          `SELECT p.id, p.payment_date, p.amount, p.currency, p.is_partial,
                  pr.name as property_name, t.fullname as tenant_name,
                  (SELECT COALESCE(SUM(amount), 0) FROM payments
                   WHERE tenant_id = p.tenant_id AND property_id = p.property_id
                     AND is_voided = 0) as total_paid
           FROM payments p
           LEFT JOIN properties pr ON p.property_id = pr.id
           LEFT JOIN tenants t ON p.tenant_id = t.id
           WHERE p.is_voided = 0${wc.clause}
           ORDER BY p.payment_date ASC
           LIMIT 10`
        )
        .all(...wc.params)
    } catch {
      throw new Error('FAILED_TO_LOAD_OVERDUE')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-12: Upcoming recurring expenses due in the next 7 days      */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:upcomingRecurring', async (_, country?: string) => {
    try {
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
    } catch {
      throw new Error('FAILED_TO_LOAD_UPCOMING_RECURRING')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-13: Documents expiring in the next 30 days                  */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:expiringDocuments', async (_, country?: string) => {
    try {
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
    } catch {
      throw new Error('FAILED_TO_LOAD_EXPIRING_DOCUMENTS')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-07/08: Income & expense trends over the last 12 months      */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:trends', async (_, country?: string) => {
    try {
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
        .all(...incomeParams) as { month: string; total: number; currency: string }[]

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
        .all(...expenseParams) as { month: string; total: number; currency: string }[]

      return { income, expense, startDate, endDate }
    } catch {
      throw new Error('FAILED_TO_LOAD_TRENDS')
    }
  })
}
