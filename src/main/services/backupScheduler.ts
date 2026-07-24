/**
 * INTENT: Interval-based scheduled backup service (FR-BAK-02). Checks every 60 seconds
 *         whether a scheduled backup is due based on backup_frequency + backup_time settings.
 *         Supports two tiers: database-only backups (frequent) and full backups with documents
 *         (less frequent). Reuses createBackup and pruneOldBackups from backupService.
 *
 * CONSTRAINTS:
 *   - Scheduler runs in the main process only — no renderer access.
 *   - Backup type is 'automatic' (not 'manual' or 'pre_restore').
 *   - Only one backup of each kind can run at a time (guard flags prevent overlapping runs).
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
  full_backup_enabled: number
  full_backup_frequency: 'monthly' | 'weekly'
  full_backup_time: string
  last_full_backup_at: string | null
}

let intervalId: ReturnType<typeof setInterval> | null = null
let isRunningDb = false
let isRunningFull = false

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

/** Check if a full backup (with documents) is due based on full_backup_frequency + full_backup_time. */
function shouldRunFull(settings: ScheduleSettings): boolean {
  if (!settings.full_backup_enabled) return false

  const now = new Date()
  const scheduledTime = parseTimeToToday(settings.full_backup_time)

  if (now < scheduledTime) return false

  const lastRun = settings.last_full_backup_at ? new Date(settings.last_full_backup_at) : null

  if (settings.full_backup_frequency === 'weekly') {
    if (!lastRun) return true
    const daysSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceLastRun >= 7
  }

  if (settings.full_backup_frequency === 'monthly') {
    if (!lastRun) return true
    const daysSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceLastRun >= 30
  }

  return false
}

function resolveBackupDir(backupPath: string | null): string {
  return backupPath?.trim() || join(app.getPath('documents'), 'PropertyManager', 'Backups')
}

function tick(db: Database): void {
  const settings = db
    .prepare(
      `SELECT backup_enabled, backup_frequency, backup_time,
              last_scheduled_backup_at, backup_path, max_backup_count,
              full_backup_enabled, full_backup_frequency, full_backup_time,
              last_full_backup_at
       FROM settings WHERE id = 1`
    )
    .get() as ScheduleSettings | undefined

  if (!settings) return

  const backupDir = resolveBackupDir(settings.backup_path)

  // Database-only backup check (fast, runs frequently)
  if (settings.backup_enabled && !isRunningDb && shouldRun(settings)) {
    isRunningDb = true
    try {
      const result = createBackup(db, backupDir, 'automatic', dbPath, undefined, 'database-only')
      if (result.success) {
        db.prepare(
          'UPDATE settings SET last_scheduled_backup_at = datetime("now") WHERE id = 1'
        ).run()
        pruneOldBackups(db, settings.max_backup_count)
      }
    } catch {
      // Silent failure — backup failure is non-critical; next tick will retry.
    } finally {
      isRunningDb = false
    }
  }

  // Full backup check (includes documents, runs less frequently)
  if (!isRunningFull && shouldRunFull(settings)) {
    isRunningFull = true
    try {
      const result = createBackup(db, backupDir, 'automatic', dbPath, undefined, 'full')
      if (result.success) {
        db.prepare('UPDATE settings SET last_full_backup_at = datetime("now") WHERE id = 1').run()
        pruneOldBackups(db, settings.max_backup_count)
      }
    } catch {
      // Silent failure — next tick will retry.
    } finally {
      isRunningFull = false
    }
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
