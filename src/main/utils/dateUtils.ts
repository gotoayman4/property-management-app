/**
 * @file dateUtils — Shared date formatting and calculation utilities for the main process.
 *
 * INTENT: Centralize local YYYY-MM-DD date formatting and day arithmetic across IPC handlers
 *         and services, eliminating duplicate helper functions in dashboardIpc, notificationIpc,
 *         recurringSchedule, and reportService.
 *
 * CONSTRAINTS:
 *   - Dates are formatted using local timezone values (getFullYear, getMonth, getDate) so that
 *     date boundaries match the user's local day boundaries without UTC shifting.
 */

/**
 * Format a Date object as a YYYY-MM-DD string using local time.
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Add N days to a Date and return the resulting YYYY-MM-DD string.
 */
export function addDays(d: Date, n: number): string {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return toLocalISODate(r)
}

/**
 * Add N days to a Date and return a new Date object.
 */
export function addDaysDate(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
