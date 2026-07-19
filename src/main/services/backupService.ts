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
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
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
 * Compute SHA-256 hex digest of a file.
 * Used by FR-BAK-06 for backup integrity verification.
 */
function computeChecksum(filePath: string): string {
  const data = readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
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
 * Create a backup of the SQLite database.
 *
 * 1. Checkpoints the WAL so the .db file is fully self-contained.
 * 2. Copies the .db file to the backup path with a timestamped filename.
 * 3. Computes SHA-256 checksum.
 * 4. Logs the operation to backup_log.
 *
 * INTENT: `dbPath` is supplied by the caller (the canonical `dbPath` exported from
 *         db/database.ts) so the service never has to ask SQLite where its own file lives.
 * CONSTRAINT: FR-BAK-01, FR-BAK-03, FR-BAK-06, FR-BAK-07.
 * CAVEAT: Earlier versions resolved `dbPath` via `db.pragma('database_list', { simple: true })`,
 *         which returns only the `seq` column (the integer `0`), not the file path — silently
 *         making every backup fail. See regression test "fails when dbPath is missing".
 *
 * FR-BAK-01, FR-BAK-03, FR-BAK-06, FR-BAK-07
 */
export function createBackup(
  db: Database,
  backupDir: string,
  type: 'manual' | 'automatic',
  dbPath: string
): BackupResult {
  try {
    // Ensure backup directory exists
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true })
    }

    // Flush WAL to main DB file so the copy is consistent
    db.pragma('wal_checkpoint(TRUNCATE)')

    // Build a timestamped filename: Backup_YYYY-MM-DD_HHmmss.db
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const fileName = `Backup_${timestamp}.db`
    const destPath = join(backupDir, fileName)

    if (!dbPath) {
      return {
        success: false,
        filePath: null,
        checksum: null,
        error: 'Could not resolve database path'
      }
    }

    copyFileSync(dbPath, destPath)

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
 * Restore the database from a backup.
 *
 * 1. Verifies the backup checksum.
 * 2. Creates an emergency backup of the current state.
 * 3. Copies the backup file over the current DB.
 *
 * IMPORTANT: After restore, the caller MUST reinitialize the database connection
 * (close and reopen). This function returns success but the app needs a restart
 * to pick up the new data.
 *
 * FR-BAK-05, SRS §16 pre-restore safety backup.
 */
export function restoreFromBackup(
  db: Database,
  backupId: number,
  backupDir: string,
  dbPath: string
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

    // Create pre-restore emergency backup
    db.pragma('wal_checkpoint(TRUNCATE)')
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const emergencyName = `PreRestore_${timestamp}.db`
    const emergencyPath = join(backupDir, emergencyName)

    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })
    copyFileSync(dbPath, emergencyPath)

    const emergencyChecksum = computeChecksum(emergencyPath)
    db.prepare(
      `INSERT INTO backup_log (backup_file_path, backup_type, file_size_kb, checksum, is_verified, status)
       VALUES (?, 'pre_restore', ?, ?, 1, 'success')`
    ).run(emergencyPath, fileSizeKB(emergencyPath), emergencyChecksum)

    // Copy backup over current DB
    copyFileSync(row.backup_file_path, dbPath)

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
