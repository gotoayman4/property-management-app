import { join } from 'path'
import { ipcMain, app } from 'electron'
import { db, dbPath } from '../db/database'
import { createBackup } from '../services/backupService'
import { logger } from '../utils/logger'

/**
 * INTENT: IPC handlers for data-level operations — wipe/reset all user data.
 * CONSTRAINT: Wipe is destructive and irreversible. The confirmation token must be 'DELETE'
 *             in uppercase — this is checked in BOTH the renderer UI (disabled button) and
 *             the main process (double verification).
 * DECISION: Protected tables (migrations, countries, settings, expense_categories,
 *           notification_templates, users, backup_log) survive the wipe so the app remains
 *           functional without requiring re-setup of configuration. An automatic backup is
 *           created before the wipe so the user can restore if needed.
 */

/** Tables that are preserved during a wipe (system configuration / seed data + backup history). */
const PROTECTED_TABLES = [
  'migrations',
  'countries',
  'settings',
  'expense_categories',
  'notification_templates',
  'users',
  'backup_log'
]

/** Resolve the backup directory: settings.backup_path → Documents/Backups → fallback. */
function resolveBackupDir(): string {
  const settings = db.prepare('SELECT backup_path FROM settings WHERE id = 1').get() as
    { backup_path: string | null } | undefined
  if (settings?.backup_path && settings.backup_path.trim().length > 0) {
    return settings.backup_path.trim()
  }
  return join(app.getPath('documents'), 'PropertyManager', 'Backups')
}

export function registerDataIpcHandlers(): void {
  ipcMain.handle('data:wipeAll', async (_, token: string) => {
    // Double-verify token even though UI already checks — defense in depth.
    if (token !== 'DELETE') {
      throw new Error('INVALID_WIPE_TOKEN')
    }

    try {
      // Create an automatic backup before wiping so the user can restore if needed.
      const backupDir = resolveBackupDir()
      createBackup(db, backupDir, 'automatic', dbPath)

      // Get all user-data tables (exclude system/sqlite internals and protected tables).
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name NOT LIKE 'sqlite_%'
             AND name NOT IN (${PROTECTED_TABLES.map(() => '?').join(', ')})`
        )
        .all(...PROTECTED_TABLES) as Array<{ name: string }>

      // Disable FK checks so we can delete in any order.
      db.pragma('foreign_keys = OFF')

      const deleteAll = db.transaction(() => {
        for (const { name } of tables) {
          db.prepare(`DELETE FROM "${name}"`).run()
        }
      })
      deleteAll()

      db.pragma('foreign_keys = ON')

      return { success: true }
    } catch (error: unknown) {
      logger.error('Error wiping data', error)
      // Ensure FK checks are re-enabled even on failure.
      try {
        db.pragma('foreign_keys = ON')
      } catch {
        /* best-effort */
      }
      throw new Error('FAILED_TO_WIPE_DATA')
    }
  })
}
