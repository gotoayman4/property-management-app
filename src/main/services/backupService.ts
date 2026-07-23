/**
 * @file backupService — core backup/restore operations (SRS Module 11, FR-BAK-01 through FR-BAK-07).
 *
 * INTENT: Provide the ONLY place where database backup, restore, and integrity operations run.
 *         Uses wal_checkpoint + fs.copyFileSync for reliable offline backups — no external tools.
 *
 * CONSTRAINTS:
 *   - FR-BAK-06: every backup is SHA-256 checksummed; verify before restore.
 *   - BR-12: auto-backup uses a FIFO retention policy (max_backup_count, default 10).
 *   - BR-09: backup_failed notification is created on failure (the caller handles notification insertion).
 *   - Pre-restore: an emergency backup is always created before overwriting current data (SRS §16).
 *
 * DECISION: Functions accept `db` as a parameter so the module is unit-testable against in-memory
 *           DB + temp directories (mirrors ledgerService.ts pattern).
 */

import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
  openSync,
  readSync,
  closeSync,
  statSync,
  readdirSync,
  writeFileSync
} from 'fs'
import { join, basename } from 'path'
import AdmZip from 'adm-zip'
import { Database } from 'better-sqlite3'

// Reserved for auto-backup interval enforcement (BR-12 guard).
// const MIN_AUTO_BACKUP_INTERVAL_HOURS = 1

/** Backup log row returned by listBackups. */
export interface BackupLogRow {
  id: number
  backup_file_path: string
  backup_type: 'manual' | 'automatic' | 'pre_restore'
  file_size_kb: number | null
  checksum: string | null
  is_verified: number
  status: 'success' | 'failed'
  error_message: string | null
  created_at: string
}

/** Result of a backup operation. */
export interface BackupResult {
  success: boolean
  filePath: string | null
  checksum: string | null
  error?: string
}

/** Result of a restore operation. */
export interface RestoreResult {
  success: boolean
  emergencyBackupPath: string | null
  error?: string
}

/**
 * Resolve default documents directory if running in Electron environment.
 */
function defaultDocumentsDir(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      const dir = join(app.getPath('userData'), 'documents')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      return dir
    }
  } catch {
    /* non-electron environment or test mode */
  }
  return undefined
}

/**
 * Compute SHA-256 hex digest of a file using 64KB chunks.
 * Used by FR-BAK-06 for backup integrity verification without loading large ZIPs into memory.
 */
function computeChecksum(filePath: string): string {
  const hash = createHash('sha256')
  const fd = openSync(filePath, 'r')
  const buffer = Buffer.alloc(64 * 1024)
  let bytesRead = 0
  try {
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

/**
 * Format a file size in KB from bytes.
 */
function fileSizeKB(filePath: string): number {
  try {
    return Math.round(statSync(filePath).size / 1024)
  } catch {
    return 0
  }
}

/**
 * Create a backup of the SQLite database and all uploaded documents.
 *
 * 1. Checkpoints the WAL so the .db file is fully self-contained.
 * 2. Bundles database.db and uploaded documents into a timestamped ZIP archive.
 * 3. Computes SHA-256 checksum.
 * 4. Logs the operation to backup_log.
 *
 * FR-BAK-01, FR-BAK-03, FR-BAK-06, FR-BAK-07
 */
export function createBackup(
  db: Database,
  backupDir: string,
  type: 'manual' | 'automatic' | 'pre_restore',
  dbPath: string,
  documentsDir?: string
): BackupResult {
  try {
    if (!dbPath) {
      return {
        success: false,
        filePath: null,
        checksum: null,
        error: 'Could not resolve database path'
      }
    }

    // Ensure backup directory exists
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true })
    }

    // Flush WAL to main DB file so the copy is consistent
    db.pragma('wal_checkpoint(TRUNCATE)')

    // Build a timestamped filename: Backup_YYYY-MM-DD_HHmmss.zip
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const fileName = `Backup_${timestamp}.zip`
    const destPath = join(backupDir, fileName)

    const zip = new AdmZip()

    // Add SQLite database as database.db
    zip.addLocalFile(dbPath, '', 'database.db')

    // Add documents folder if it exists
    const targetDocsDir = documentsDir ?? defaultDocumentsDir()
    if (targetDocsDir && existsSync(targetDocsDir)) {
      try {
        const files = readdirSync(targetDocsDir)
        if (files.length > 0) {
          zip.addLocalFolder(targetDocsDir, 'documents')
        }
      } catch (err) {
        console.warn('Failed to add documents folder to backup:', err)
      }
    }

    // Add any documents referenced in DB that might live elsewhere
    try {
      const docRows = db
        .prepare('SELECT file_path FROM documents WHERE file_path IS NOT NULL')
        .all() as { file_path: string }[]
      for (const row of docRows) {
        if (row.file_path && existsSync(row.file_path)) {
          const fileBase = basename(row.file_path)
          const zipPath = `documents/${fileBase}`
          if (!zip.getEntry(zipPath)) {
            zip.addLocalFile(row.file_path, 'documents', fileBase)
          }
        }
      }
    } catch {
      /* best-effort */
    }

    zip.writeZip(destPath)

    // Compute checksum
    const checksum = computeChecksum(destPath)

    // Log to backup_log
    db.prepare(
      `INSERT INTO backup_log (backup_file_path, backup_type, file_size_kb, checksum, is_verified, status)
       VALUES (?, ?, ?, ?, 1, 'success')`
    ).run(destPath, type, fileSizeKB(destPath), checksum)

    return { success: true, filePath: destPath, checksum }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Log failure
    try {
      db.prepare(
        `INSERT INTO backup_log (backup_file_path, backup_type, file_size_kb, checksum, is_verified, status, error_message)
         VALUES (?, ?, NULL, NULL, 0, 'failed', ?)`
      ).run(join(backupDir, 'failed_attempt'), type, msg)
    } catch {
      /* best-effort logging */
    }

    return { success: false, filePath: null, checksum: null, error: msg }
  }
}

/**
 * List all backup log entries sorted by most recent first (FR-BAK-07).
 */
export function listBackups(db: Database): BackupLogRow[] {
  return db.prepare('SELECT * FROM backup_log ORDER BY created_at DESC').all() as BackupLogRow[]
}

/**
 * Verify a backup file's integrity by recomputing its SHA-256 checksum
 * and comparing against the stored value (FR-BAK-06).
 */
export function verifyBackup(db: Database, backupId: number): { valid: boolean; error?: string } {
  const row = db.prepare('SELECT * FROM backup_log WHERE id = ?').get(backupId) as
    BackupLogRow | undefined
  if (!row) return { valid: false, error: 'Backup record not found' }
  if (!existsSync(row.backup_file_path))
    return { valid: false, error: 'Backup file not found on disk' }

  try {
    const currentChecksum = computeChecksum(row.backup_file_path)
    if (row.checksum && currentChecksum !== row.checksum) {
      return { valid: false, error: 'Checksum mismatch — file may be corrupted' }
    }
    // Update verification flag
    db.prepare('UPDATE backup_log SET is_verified = 1 WHERE id = ?').run(backupId)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Restore database and uploaded documents from a backup.
 *
 * 1. Verifies backup checksum.
 * 2. Creates an emergency backup of the current state.
 * 3. Restores database.db and documents directory (supports ZIP and legacy .db backups).
 *
 * FR-BAK-05, SRS §16 pre-restore safety backup.
 */
export function restoreFromBackup(
  db: Database,
  backupId: number,
  backupDir: string,
  dbPath: string,
  documentsDir?: string
): RestoreResult {
  try {
    const row = db.prepare('SELECT * FROM backup_log WHERE id = ?').get(backupId) as
      BackupLogRow | undefined
    if (!row) return { success: false, emergencyBackupPath: null, error: 'Backup record not found' }
    if (!existsSync(row.backup_file_path)) {
      return { success: false, emergencyBackupPath: null, error: 'Backup file not found on disk' }
    }

    // Verify integrity
    const currentChecksum = computeChecksum(row.backup_file_path)
    if (row.checksum && currentChecksum !== row.checksum) {
      return {
        success: false,
        emergencyBackupPath: null,
        error: 'Checksum mismatch — backup may be corrupted'
      }
    }

    const targetDocsDir = documentsDir ?? defaultDocumentsDir()

    // Create pre-restore emergency backup
    db.pragma('wal_checkpoint(TRUNCATE)')
    const emergencyResult = createBackup(db, backupDir, 'pre_restore', dbPath, targetDocsDir)
    const emergencyPath = emergencyResult.filePath

    let restoredZip = false
    try {
      const zip = new AdmZip(row.backup_file_path)
      const dbEntry = zip.getEntry('database.db')
      if (dbEntry) {
        restoredZip = true
        // Extract database.db to dbPath
        const dbData = dbEntry.getData()
        writeFileSync(dbPath, dbData)

        // Extract documents/ if targetDocsDir is available
        if (targetDocsDir) {
          if (!existsSync(targetDocsDir)) {
            mkdirSync(targetDocsDir, { recursive: true })
          }
          const entries = zip.getEntries()
          for (const entry of entries) {
            const normName = entry.entryName.replace(/\\/g, '/')
            if (!entry.isDirectory && normName.startsWith('documents/')) {
              const relName = normName.substring('documents/'.length)
              if (relName) {
                const destFilePath = join(targetDocsDir, relName)
                const destFolder = join(destFilePath, '..')
                if (!existsSync(destFolder)) {
                  mkdirSync(destFolder, { recursive: true })
                }
                writeFileSync(destFilePath, entry.getData())
              }
            }
          }
        }
      }
    } catch {
      restoredZip = false
    }

    if (!restoredZip) {
      // Legacy .db file backup
      copyFileSync(row.backup_file_path, dbPath)
    }

    return { success: true, emergencyBackupPath: emergencyPath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, emergencyBackupPath: null, error: msg }
  }
}

/**
 * Delete old backups beyond the retention limit (FIFO policy).
 * Also removes the corresponding files from disk.
 *
 * FR-BAK-04, BR-12.
 */
export function pruneOldBackups(
  db: Database,
  maxCount: number
): { deleted: number; errors: string[] } {
  const errors: string[] = []
  let deleted = 0

  const allBackups = db
    .prepare(
      "SELECT id, backup_file_path FROM backup_log WHERE status = 'success' ORDER BY created_at DESC"
    )
    .all() as { id: number; backup_file_path: string }[]

  if (allBackups.length <= maxCount) return { deleted: 0, errors: [] }

  const toPrune = allBackups.slice(maxCount)
  for (const backup of toPrune) {
    try {
      // Remove file from disk
      if (existsSync(backup.backup_file_path)) {
        unlinkSync(backup.backup_file_path)
      }
    } catch (err) {
      errors.push(
        `Failed to delete file ${backup.backup_file_path}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    // Remove from DB
    db.prepare('DELETE FROM backup_log WHERE id = ?').run(backup.id)
    deleted++
  }

  return { deleted, errors }
}

/**
 * Delete a single backup record and its on-disk file.
 *
 * INTENT: Per-row deletion for the Backup page's row actions. Unlike `pruneOldBackups` (which
 *         removes by FIFO retention), this deletes a user-chosen entry regardless of age or type.
 *
 * CONSTRAINT:
 *   - Best-effort file removal: if the file is already gone (manual cleanup, moved folder), the
 *     DB row is still deleted — we don't fail the whole operation over a missing file.
 *   - Pre-restore emergency backups can also be deleted this way; deletion is not limited to
 *     `status = 'success'` rows, since failed entries and pre-restore snapshots may also need
 *     cleanup.
 *
 * @returns `{ success, error? }` — `success` is false only when the record doesn't exist or the
 *          DB write itself fails. Missing files do NOT count as failure.
 */
export function deleteBackup(db: Database, backupId: number): { success: boolean; error?: string } {
  const row = db.prepare('SELECT backup_file_path FROM backup_log WHERE id = ?').get(backupId) as
    { backup_file_path: string } | undefined
  if (!row) return { success: false, error: 'Backup record not found' }

  try {
    if (row.backup_file_path && existsSync(row.backup_file_path)) {
      unlinkSync(row.backup_file_path)
    }
  } catch (err) {
    // Best-effort: log and continue. We still want to delete the DB row so the list reflects
    // the user's intent — a stranded file on disk is recoverable manually; a stranded row is not.
    console.warn(
      `Failed to delete backup file ${row.backup_file_path}: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  db.prepare('DELETE FROM backup_log WHERE id = ?').run(backupId)
  return { success: true }
}
