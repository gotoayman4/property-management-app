/**
 * INTENT: Dashboard summary IPC — registers IPC channels for landing page metrics.
 *         Delegates database queries to dashboardRepository.
 */
import { ipcMain } from 'electron'
import {
  getDashboardSummary,
  getRecentPayments,
  getRecentExpenses,
  getRecentActivities,
  getUpcomingDue,
  getOverduePayments,
  getUpcomingRecurring,
  getExpiringDocuments,
  getFinancialTrends
} from '../db/dashboardRepository'
import { db } from '../db/database'

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle('dashboard:summary', async (_, country?: string) => {
    try {
      return getDashboardSummary(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_DASHBOARD')
    }
  })

  ipcMain.handle('dashboard:recentPayments', async (_, country?: string) => {
    try {
      return getRecentPayments(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_RECENT_PAYMENTS')
    }
  })

  ipcMain.handle('dashboard:recentExpenses', async (_, country?: string) => {
    try {
      return getRecentExpenses(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_RECENT_EXPENSES')
    }
  })

  ipcMain.handle('dashboard:recentActivities', async (_, country?: string) => {
    try {
      return getRecentActivities(db, country)
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[dashboard:recentActivities]', err)
      }
      throw new Error('FAILED_TO_LOAD_RECENT_ACTIVITIES')
    }
  })

  ipcMain.handle('dashboard:upcomingDue', async (_, country?: string) => {
    try {
      return getUpcomingDue(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_UPCOMING_DUE')
    }
  })

  ipcMain.handle('dashboard:overdue', async (_, country?: string) => {
    try {
      return getOverduePayments(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_OVERDUE')
    }
  })

  ipcMain.handle('dashboard:upcomingRecurring', async (_, country?: string) => {
    try {
      return getUpcomingRecurring(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_UPCOMING_RECURRING')
    }
  })

  ipcMain.handle('dashboard:expiringDocuments', async (_, country?: string) => {
    try {
      return getExpiringDocuments(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_EXPIRING_DOCUMENTS')
    }
  })

  ipcMain.handle('dashboard:trends', async (_, country?: string) => {
    try {
      return getFinancialTrends(db, country)
    } catch {
      throw new Error('FAILED_TO_LOAD_TRENDS')
    }
  })
}
