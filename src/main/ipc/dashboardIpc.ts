/**
 * INTENT: Dashboard summary IPC — returns aggregate counts and totals for the
 *         landing page StatCards and dashboard lists: upcoming due, overdue,
 *         recurring expenses, expiring documents, and 12-month trends.
 * CONSTRAINT: property_id can be NULL in payments/expenses (general items); handle NULLs in joins.
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

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle('dashboard:summary', async () => {
    try {
      const totalProperties = (
        db.prepare('SELECT COUNT(*) as cnt FROM properties WHERE is_archived = 0').get() as {
          cnt: number
        }
      ).cnt

      const rentedProperties = (
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

      const activeContracts = (
        db.prepare("SELECT COUNT(*) as cnt FROM contracts WHERE status = 'active'").get() as {
          cnt: number
        }
      ).cnt

      const totalPayments = (
        db
          .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE is_voided = 0')
          .get() as { total: number }
      ).total

      const totalExpenses = (
        db
          .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE is_voided = 0')
          .get() as { total: number }
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

  ipcMain.handle('dashboard:recentPayments', async () => {
    try {
      return db
        .prepare(
          `SELECT p.id, p.payment_date, p.amount, p.currency, p.payment_type, p.receipt_number,
                  pr.name as property_name, t.fullname as tenant_name
           FROM payments p
           LEFT JOIN properties pr ON p.property_id = pr.id
           LEFT JOIN tenants t ON p.tenant_id = t.id
           WHERE p.is_voided = 0
           ORDER BY p.payment_date DESC, p.id DESC
           LIMIT 5`
        )
        .all()
    } catch {
      throw new Error('FAILED_TO_LOAD_RECENT_PAYMENTS')
    }
  })

  ipcMain.handle('dashboard:recentExpenses', async () => {
    try {
      return db
        .prepare(
          `SELECT e.id, e.expense_date, e.amount, e.currency, e.vendor_name,
                  ec.name_key as category_key, pr.name as property_name
           FROM expenses e
           LEFT JOIN expense_categories ec ON e.category_id = ec.id
           LEFT JOIN properties pr ON e.property_id = pr.id
           WHERE e.is_voided = 0
           ORDER BY e.expense_date DESC, e.id DESC
           LIMIT 5`
        )
        .all()
    } catch {
      throw new Error('FAILED_TO_LOAD_RECENT_EXPENSES')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-04: Upcoming rent due in the next 7 days                    */
  /* Shows active contracts with their monthly rent as "due" marker.     */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:upcomingDue', async () => {
    try {
      return db
        .prepare(
          `SELECT c.id, c.rent_amount, c.currency, p.name as property_name,
                  t.fullname as tenant_name, c.end_date
           FROM contracts c
           JOIN properties p ON c.property_id = p.id
           JOIN tenants t ON c.tenant_id = t.id
           WHERE c.status = 'active'
           ORDER BY c.end_date ASC
           LIMIT 10`
        )
        .all()
    } catch {
      throw new Error('FAILED_TO_LOAD_UPCOMING_DUE')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-05: Overdue payments sorted oldest first                    */
  /* Queries payments where is_voided = 0, grouped by tenant/property.   */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:overdue', async () => {
    try {
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
           WHERE p.is_voided = 0
           ORDER BY p.payment_date ASC
           LIMIT 10`
        )
        .all()
    } catch {
      throw new Error('FAILED_TO_LOAD_OVERDUE')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-12: Upcoming recurring expenses due in the next 7 days      */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:upcomingRecurring', async () => {
    try {
      const today = toLocalISODate(new Date())
      const in7Days = addDays(new Date(), 7)
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
             AND (rt.end_date IS NULL OR rt.end_date >= ?)
           ORDER BY rt.next_due_date ASC
           LIMIT 10`
        )
        .all(in7Days, today)
    } catch {
      throw new Error('FAILED_TO_LOAD_UPCOMING_RECURRING')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-13: Documents expiring in the next 30 days                  */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:expiringDocuments', async () => {
    try {
      const today = toLocalISODate(new Date())
      const in30Days = addDays(new Date(), 30)
      return db
        .prepare(
          `SELECT d.id, d.file_name, d.document_type, d.expiry_date, d.issue_date,
                  pr.name as property_name
           FROM documents d
           JOIN properties pr ON d.entity_type = 'property' AND d.entity_id = pr.id
           WHERE d.is_archived = 0
             AND d.expiry_date IS NOT NULL
             AND d.expiry_date BETWEEN ? AND ?
           ORDER BY d.expiry_date ASC
           LIMIT 10`
        )
        .all(today, in30Days)
    } catch {
      throw new Error('FAILED_TO_LOAD_EXPIRING_DOCUMENTS')
    }
  })

  /* ------------------------------------------------------------------ */
  /* FR-DASH-07/08: Income & expense trends over the last 12 months      */
  /* Returns month-by-month aggregates for chart rendering.              */
  /* ------------------------------------------------------------------ */
  ipcMain.handle('dashboard:trends', async () => {
    try {
      const today = new Date()
      const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1)
      const startDate = toLocalISODate(twelveMonthsAgo)
      const endDate = toLocalISODate(today)

      const income = db
        .prepare(
          `SELECT strftime('%Y-%m', payment_date) as month,
                  SUM(amount) as total, currency
           FROM payments
           WHERE is_voided = 0 AND payment_date >= ? AND payment_date <= ?
           GROUP BY month, currency
           ORDER BY month ASC`
        )
        .all(startDate, endDate) as { month: string; total: number; currency: string }[]

      const expense = db
        .prepare(
          `SELECT strftime('%Y-%m', expense_date) as month,
                  SUM(amount) as total, currency
           FROM expenses
           WHERE is_voided = 0 AND expense_date >= ? AND expense_date <= ?
           GROUP BY month, currency
           ORDER BY month ASC`
        )
        .all(startDate, endDate) as { month: string; total: number; currency: string }[]

      return { income, expense, startDate, endDate }
    } catch {
      throw new Error('FAILED_TO_LOAD_TRENDS')
    }
  })
}
