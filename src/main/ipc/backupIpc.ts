/**
 * @file backupIpc — IPC handlers for backup & restore (SRS Module 11).
 *
 * INTENT: Expose backup/restore/list/verify/prune operations to the renderer.
 *         All filesystem I/O happens in the main process — the renderer never touches the disk.
 *
 * CONSTRAINTS:
 *   - FR-BAK-05: restore requires two-phase confirmation (first call returns backup info,
 *     second call performs the actual restore).
 *   - FR-BAK-06: verify checksum before restore.
 *   - NFR-SEC-05: all queries parameterized.
 */

import { join } from 'path'
import { ipcMain, app } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'
import {
  createBackup,
  listBackups,
  verifyBackup,
  restoreFromBackup,
  pruneOldBackups
} from '../services/backupService'

/** Resolve the backup directory: settings.backup_path → Documents/Backups → fallback. */
function resolveBackupDir(): string {
  const settings = db.prepare('SELECT backup_path FROM settings WHERE id = 1').get() as
    { backup_path: string | null } | undefined
  if (settings?.backup_path && settings.backup_path.trim().length > 0) {
    return settings.backup_path.trim()
  }
  return join(app.getPath('documents'), 'PropertyManager', 'Backups')
}

/** Resolve the active DB file path from pragma. */
function getDbPath(): string {
  const paths = db.pragma('database_list', { simple: true }) as string[]
  return paths[0] || join(app.getPath('userData'), 'database.db')
}

// Reserved for future two-phase restore validation
// const restoreConfirmSchema = z.object({
//   backupId: z.number().int().positive()
// })

export function registerBackupIpcHandlers(): void {
  /**
   * backup:create — Perform a manual backup (FR-BAK-01).
   * Returns the backup result including file path and checksum.
   */
  ipcMain.handle('backup:create', async () => {
    try {
      const backupDir = resolveBackupDir()
      const result = createBackup(db, backupDir, 'manual')

      // On success, prune old backups per retention limit
      if (result.success) {
        const settings = db.prepare('SELECT max_backup_count FROM settings WHERE id = 1').get() as
          { max_backup_count: number } | undefined
        pruneOldBackups(db, settings?.max_backup_count ?? 10)
      }

      return result
    } catch (error) {
      console.error('Backup creation error:', error)
      throw new Error('FAILED_TO_CREATE_BACKUP')
    }
  })

  /**
   * backup:list — List all backup log entries (FR-BAK-07).
   */
  ipcMain.handle('backup:list', async () => {
    try {
      return listBackups(db)
    } catch (error) {
      console.error('Backup list error:', error)
      throw new Error('FAILED_TO_LIST_BACKUPS')
    }
  })

  /**
   * backup:verify — Verify a specific backup file's checksum (FR-BAK-06).
   */
  ipcMain.handle('backup:verify', async (_, data: unknown) => {
    try {
      const parsed = z.object({ backupId: z.number().int().positive() }).parse(data)
      return verifyBackup(db, parsed.backupId)
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      console.error('Backup verify error:', error)
      throw new Error('FAILED_TO_VERIFY_BACKUP')
    }
  })

  /**
   * backup:restore — Two-phase restore (FR-BAK-05).
   *
   * Phase 1 (confirm = false): returns backup info for display in confirmation dialog.
   * Phase 2 (confirm = true):  performs the actual restore.
   *
   * After a successful restore, the app MUST be restarted to pick up the new data.
   */
  ipcMain.handle('backup:restore', async (_, data: unknown) => {
    try {
      const parsed = z
        .object({
          backupId: z.number().int().positive(),
          confirm: z.boolean().default(false)
        })
        .parse(data)

      // Phase 1: return backup info for confirmation
      if (!parsed.confirm) {
        const row = db
          .prepare(
            'SELECT id, backup_file_path, backup_type, file_size_kb, created_at FROM backup_log WHERE id = ?'
          )
          .get(parsed.backupId) as
          | {
              id: number
              backup_file_path: string
              backup_type: string
              file_size_kb: number | null
              created_at: string
            }
          | undefined

        if (!row) throw new Error('BACKUP_NOT_FOUND')
        return {
          confirmed: false,
          backupInfo: row
        }
      }

      // Phase 2: perform restore
      const backupDir = resolveBackupDir()
      const dbPath = getDbPath()
      const result = restoreFromBackup(db, parsed.backupId, backupDir, dbPath)

      if (result.success) {
        return {
          confirmed: true,
          success: true,
          emergencyBackupPath: result.emergencyBackupPath,
          requiresRestart: true
        }
      }

      return {
        confirmed: true,
        success: false,
        error: result.error
      }
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof Error && error.message === 'BACKUP_NOT_FOUND') throw error
      console.error('Backup restore error:', error)
      throw new Error('FAILED_TO_RESTORE_BACKUP')
    }
  })

  /**
   * backup:prune — Manually trigger backup pruning (FR-BAK-04).
   */
  ipcMain.handle('backup:prune', async () => {
    try {
      const settings = db.prepare('SELECT max_backup_count FROM settings WHERE id = 1').get() as
        { max_backup_count: number } | undefined
      const result = pruneOldBackups(db, settings?.max_backup_count ?? 10)
      return result
    } catch (error) {
      console.error('Backup prune error:', error)
      throw new Error('FAILED_TO_PRUNE_BACKUPS')
    }
  })
}
