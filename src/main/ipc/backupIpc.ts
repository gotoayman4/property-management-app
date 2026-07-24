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

import { createHash } from 'crypto'
import { existsSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { ipcMain, app, BrowserWindow } from 'electron'
import { z } from 'zod'
import { db, dbPath } from '../db/database'
import {
  createBackup,
  listBackups,
  verifyBackup,
  restoreFromBackup,
  pruneOldBackups,
  deleteBackup
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

export function registerBackupIpcHandlers(): void {
  /**
   * backup:create — Perform a manual full backup (FR-BAK-01).
   * Returns the backup result including file path and checksum.
   * Includes both database and uploaded documents.
   */
  ipcMain.handle('backup:create', async () => {
    try {
      const backupDir = resolveBackupDir()
      const result = createBackup(db, backupDir, 'manual', dbPath, undefined, 'full')

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
   * backup:createDatabaseOnly — Perform a quick manual backup (database only, no documents).
   * INTENT: Fast backup for when the user wants a safety snapshot without the overhead of
   *         compressing large document files. Documents are still protected by the latest
   *         full backup.
   */
  ipcMain.handle('backup:createDatabaseOnly', async () => {
    try {
      const backupDir = resolveBackupDir()
      const result = createBackup(db, backupDir, 'manual', dbPath, undefined, 'database-only')

      if (result.success) {
        const settings = db.prepare('SELECT max_backup_count FROM settings WHERE id = 1').get() as
          { max_backup_count: number } | undefined
        pruneOldBackups(db, settings?.max_backup_count ?? 10)
      }

      return result
    } catch (error) {
      console.error('Database-only backup creation error:', error)
      throw new Error('FAILED_TO_CREATE_DATABASE_ONLY_BACKUP')
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
   * Supports restoring by backupId OR by explicit filePath.
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
          backupId: z.number().int().positive().optional(),
          filePath: z.string().min(1).optional(),
          confirm: z.boolean().default(false)
        })
        .refine((d) => d.backupId !== undefined || d.filePath !== undefined, {
          message: 'Either backupId or filePath must be provided'
        })
        .parse(data)

      let targetBackupId = parsed.backupId

      if (!targetBackupId && parsed.filePath) {
        if (!existsSync(parsed.filePath)) {
          throw new Error('BACKUP_NOT_FOUND')
        }
        const existing = db
          .prepare('SELECT id FROM backup_log WHERE backup_file_path = ?')
          .get(parsed.filePath) as { id: number } | undefined

        if (existing) {
          targetBackupId = existing.id
        } else {
          const stats = statSync(parsed.filePath)
          const sizeKb = Math.round(stats.size / 1024)
          const dataBuffer = readFileSync(parsed.filePath)
          const checksum = createHash('sha256').update(dataBuffer).digest('hex')

          const info = db
            .prepare(
              `INSERT INTO backup_log (backup_file_path, backup_type, file_size_kb, checksum, is_verified, status)
               VALUES (?, 'manual', ?, ?, 1, 'success')`
            )
            .run(parsed.filePath, sizeKb, checksum)
          targetBackupId = Number(info.lastInsertRowid)
        }
      }

      if (!targetBackupId) throw new Error('BACKUP_NOT_FOUND')

      // Phase 1: return backup info for confirmation
      if (!parsed.confirm) {
        const row = db
          .prepare(
            'SELECT id, backup_file_path, backup_type, file_size_kb, created_at FROM backup_log WHERE id = ?'
          )
          .get(targetBackupId) as
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
      const result = restoreFromBackup(db, targetBackupId, backupDir, dbPath)

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

  /**
   * backup:delete — Delete a single backup record + its on-disk file.
   *
   * INTENT: Per-row deletion from the Backup page's row actions. Unlike `backup:prune` (bulk
   *         FIFO retention), this removes one user-chosen entry. The renderer confirms the
   *         destructive action via ConfirmDialog before calling this.
   * CONSTRAINT: NFR-SEC-05 — parameterized query. `backupId` is Zod-validated.
   */
  ipcMain.handle('backup:delete', async (_, data: unknown) => {
    try {
      const parsed = z.object({ backupId: z.number().int().positive() }).parse(data)
      return deleteBackup(db, parsed.backupId)
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      console.error('Backup delete error:', error)
      throw new Error('FAILED_TO_DELETE_BACKUP')
    }
  })

  /**
   * app:relaunch — Quit and relaunch the Electron app (FR-BAK-05 post-restore restart).
   *
   * INTENT: After a successful restore, the running better-sqlite3 connection still serves the
   *         pre-restore page cache. In production, `app.relaunch()` + `app.exit(0)` restarts the app.
   *         In development mode, `app.relaunch()` loses `ELECTRON_RENDERER_URL`, causing a white
   *         screen fallback. In dev, we reload the renderer window with the dev server URL.
   */
  ipcMain.handle('app:relaunch', async () => {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
      }
    } else {
      app.relaunch()
      app.exit(0)
    }
  })
}
