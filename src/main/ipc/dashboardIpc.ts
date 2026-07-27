/**
 * INTENT: Dashboard summary IPC — registers IPC channels for landing page metrics.
 *         Delegates database queries to dashboardRepository.
 * CONSTRAINT: All handlers validate optional country filter via Zod at the IPC boundary.
 */
import { ipcMain } from 'electron'
import { z } from 'zod'
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
import { logger } from '../utils/logger'

/** Zod schema for optional dashboard country filter — accepts raw string or undefined. */
const countryFilterSchema = z.string().max(100).optional()

/**
 * Parse optional country filter through Zod. Returns the validated country value
 * or undefined. Throws INVALID_INPUT on malformed payload.
 */
function parseDashboardFilter(data: unknown): string | undefined {
  return countryFilterSchema.parse(data)
}

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle('dashboard:summary', async (_, data?: unknown) => {
    try {
      return getDashboardSummary(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_DASHBOARD')
    }
  })

  ipcMain.handle('dashboard:recentPayments', async (_, data?: unknown) => {
    try {
      return getRecentPayments(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_RECENT_PAYMENTS')
    }
  })

  ipcMain.handle('dashboard:recentExpenses', async (_, data?: unknown) => {
    try {
      return getRecentExpenses(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_RECENT_EXPENSES')
    }
  })

  ipcMain.handle('dashboard:recentActivities', async (_, data?: unknown) => {
    try {
      return getRecentActivities(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      logger.error('dashboard:recentActivities', err)
      throw new Error('FAILED_TO_LOAD_RECENT_ACTIVITIES')
    }
  })

  ipcMain.handle('dashboard:upcomingDue', async (_, data?: unknown) => {
    try {
      return getUpcomingDue(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_UPCOMING_DUE')
    }
  })

  ipcMain.handle('dashboard:overdue', async (_, data?: unknown) => {
    try {
      return getOverduePayments(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_OVERDUE')
    }
  })

  ipcMain.handle('dashboard:upcomingRecurring', async (_, data?: unknown) => {
    try {
      return getUpcomingRecurring(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_UPCOMING_RECURRING')
    }
  })

  ipcMain.handle('dashboard:expiringDocuments', async (_, data?: unknown) => {
    try {
      return getExpiringDocuments(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_EXPIRING_DOCUMENTS')
    }
  })

  ipcMain.handle('dashboard:trends', async (_, data?: unknown) => {
    try {
      return getFinancialTrends(db, parseDashboardFilter(data))
    } catch (err) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LOAD_TRENDS')
    }
  })
}
