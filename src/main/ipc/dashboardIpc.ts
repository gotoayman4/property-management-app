/**
 * INTENT: Dashboard summary IPC — returns aggregate counts and totals for the
 *         landing page StatCards. Single query per metric for clarity.
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
}
