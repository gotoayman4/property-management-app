/**
 * INTENT: Interval-based scheduled backup service (FR-BAK-02). Checks every 60 seconds
 *         whether a scheduled backup is due based on backup_frequency + backup_time settings.
 *         Reuses createBackup and pruneOldBackups from backupService.
 *
 * CONSTRAINTS:
 *   - Scheduler runs in the main process only — no renderer access.
 *   - Backup type is 'automatic' (not 'manual' or 'pre_restore').
 *   - Only one backup can run at a time (guard flag prevents overlapping runs).
 *   - Checks current time in local timezone against configured backup_time (HH:mm).
 *
 * DECISION: Extracted from index.ts to keep the entry point clean. The scheduler is started
 *           once during app ready and stopped on app quit.
 */

import { join } from 'path'
import { Database } from 'better-sqlite3'
import { app } from 'electron'
import { dbPath } from '../db/database'
import { createBackup, pruneOldBackups } from './backupService'

interface ScheduleSettings {
  backup_enabled: number
  backup_frequency: 'daily' | 'weekly'
  backup_time: string
  last_scheduled_backup_at: string | null
  backup_path: string | null
  max_backup_count: number
}

let intervalId: ReturnType<typeof setInterval> | null = null
let isRunning = false

function parseTimeToToday(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d
}

function shouldRun(settings: ScheduleSettings): boolean {
  const now = new Date()
  const scheduledTime = parseTimeToToday(settings.backup_time)

  if (now < scheduledTime) return false

  const lastRun = settings.last_scheduled_backup_at
    ? new Date(settings.last_scheduled_backup_at)
    : null

  if (settings.backup_frequency === 'daily') {
    if (!lastRun) return true
    return lastRun.toDateString() !== now.toDateString()
  }

  if (settings.backup_frequency === 'weekly') {
    if (!lastRun) return true
    const daysSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceLastRun >= 7
  }

  return false
}

function tick(db: Database): void {
  if (isRunning) return

  const settings = db
    .prepare(
      `SELECT backup_enabled, backup_frequency, backup_time,
              last_scheduled_backup_at, backup_path, max_backup_count
       FROM settings WHERE id = 1`
    )
    .get() as ScheduleSettings | undefined

  if (!settings || !settings.backup_enabled) return
  if (!shouldRun(settings)) return

  isRunning = true
  try {
    const backupDir =
      settings.backup_path?.trim() || join(app.getPath('documents'), 'PropertyManager', 'Backups')
    const result = createBackup(db, backupDir, 'automatic', dbPath)
    if (result.success) {
      db.prepare(
        'UPDATE settings SET last_scheduled_backup_at = datetime("now") WHERE id = 1'
      ).run()
      pruneOldBackups(db, settings.max_backup_count)
    }
  } catch {
    // Silent failure — backup failure is non-critical; next tick will retry.
  } finally {
    isRunning = false
  }
}

/**
 * Start the scheduled backup interval. Safe to call multiple times — stops any existing
 * scheduler before starting a new one.
 */
export function startBackupScheduler(db: Database): void {
  stopBackupScheduler()
  intervalId = setInterval(() => tick(db), 60_000)
}

/** Stop the scheduled backup interval. Safe to call even if not started. */
export function stopBackupScheduler(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}
