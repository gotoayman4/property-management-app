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
  writeFileSync,
  renameSync
} from 'fs'
import { join, basename, dirname, resolve } from 'path'
import AdmZip from 'adm-zip'
import Database from 'better-sqlite3'
import { logger } from '../utils/logger'

// Reserved for auto-backup interval enforcement (BR-12 guard).
// const MIN_AUTO_BACKUP_INTERVAL_HOURS = 1

/** Backup log row returned by listBackups. */
export interface BackupLogRow {
  id: number
  backup_file_path: string
  backup_type: 'manual' | 'automatic' | 'pre_restore'
  backup_content: 'database-only' | 'full'
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
 * Recompute a file's SHA-256 and compare against an expected hex digest.
 * Exported so callers (IPC layer) can verify an arbitrary on-disk file without duplicating logic.
 * Returns true when `expected` is absent (no stored checksum to compare against — legacy rows).
 */
export function verifyFileChecksum(filePath: string, expected: string | null | undefined): boolean {
  if (!expected) return true
  try {
    return computeChecksum(filePath) === expected
  } catch {
    return false
  }
}

/** SQLite 3 database file magic: "SQLite format 3\0" (16 bytes). */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf8')

/** ZIP archive magic (PK\x03\x04 — also matches empty-ish variants). */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

/**
 * Detect a file's true format by reading its first bytes — never trust the extension.
 * Used by restore to discriminate the ZIP path from the legacy raw-SQLite path.
 * Returns 'zip' | 'sqlite' | 'unknown'.
 */
export function detectBackupFormat(filePath: string): 'zip' | 'sqlite' | 'unknown' {
  const fd = openSync(filePath, 'r')
  const head = Buffer.alloc(16)
  try {
    const n = readSync(fd, head, 0, head.length, 0)
    if (n >= 4 && head.subarray(0, 4).equals(ZIP_MAGIC)) return 'zip'
    if (n >= 16 && head.subarray(0, 16).equals(SQLITE_MAGIC)) return 'sqlite'
    return 'unknown'
  } finally {
    closeSync(fd)
  }
}

/**
 * Open `candidatePath` read-only and run `PRAGMA integrity_check`.
 * INTENT: Reject a corrupt/valid-but-damaged SQLite file BEFORE we swap it into place.
 * DECISION: Throws `Error('BACKUP_DB_CORRUPT')` on any non-`ok` result so the IPC layer can map it
 *           to a machine-readable code.
 */
function assertSqliteIntegrity(candidatePath: string): void {
  const probe = new Database(candidatePath, { readonly: true, fileMustExist: true })
  try {
    const row = probe.pragma('integrity_check', { simple: true })
    if (row !== 'ok') {
      throw new Error('BACKUP_DB_CORRUPT')
    }
  } finally {
    probe.close()
  }
}

/**
 * Atomically swap a staged DB file into the live `dbPath`, working around the Windows constraint
 * that an open file cannot be renamed over.
 *
 * INTENT: The caller has already extracted + integrity-checked `stagingPath` (in the SAME directory
 *         as `dbPath`, so the rename is same-volume and atomic). If `db` currently holds `dbPath`
 *         open, close it first so the rename succeeds. The previous implementation wrote over the
 *         open file and relied on a restart — under Windows that can fail or leave a torn file.
 *
 * CONSTRAINT: After closing `db`, the connection object is dead (better-sqlite3 has no reopen).
 *             The caller MUST restart the process to pick up the new data. The IPC layer already
 *             signals `requiresRestart: true`; the existing `app:relaunch` handler honors it.
 *
 * ROLLBACK: The pre-swap file is renamed to `${dbPath}.bak`. If the rename fails, we restore the
 *           backup so the app is never left without a usable DB on disk.
 *
 * @returns `{ closedLive: boolean }` — true when the live connection was closed (caller MUST restart).
 *          False in test mode, where `db` is bound to a different file than `dbPath`.
 */
function swapDatabaseFile(
  db: Database.Database,
  dbPath: string,
  stagingPath: string
): { closedLive: boolean } {
  const resolvedDbPath = resolve(dbPath)
  const resolvedStagingPath = resolve(stagingPath)
  const dbBakPath = `${resolvedDbPath}.bak`

  // Detect whether the passed connection is bound to dbPath (production) or a different file
  // (unit tests pass a stand-in fakeDbPath + a real `db` on another file).
  const list = db.pragma('database_list') as { name: string; file: string }[]
  const mainRow = list.find((r) => r.name === 'main')
  const closedLive = mainRow?.file === resolvedDbPath

  if (closedLive) {
    db.close()
  }

  // Preserve the current file as .bak for rollback. Remove any stale .bak first.
  try {
    unlinkSync(dbBakPath)
  } catch {
    /* no stale .bak — fine */
  }
  if (existsSync(resolvedDbPath)) {
    renameSync(resolvedDbPath, dbBakPath)
  }

  try {
    renameSync(resolvedStagingPath, resolvedDbPath)
  } catch (swapErr) {
    // Rollback: restore the old file before propagating.
    if (existsSync(dbBakPath)) {
      renameSync(dbBakPath, resolvedDbPath)
    }
    throw swapErr
  }

  return { closedLive }
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
 * Create a backup of the SQLite database, optionally including uploaded documents.
 *
 * 1. Checkpoints the WAL so the .db file is fully self-contained.
 * 2. Bundles database.db (always) and optionally uploaded documents into a timestamped ZIP.
 * 3. Computes SHA-256 checksum.
 * 4. Logs the operation to backup_log with backup_content ('database-only' | 'full').
 *
 * FR-BAK-01, FR-BAK-03, FR-BAK-06, FR-BAK-07.
 * INTENT: 'database-only' backups skip documents for speed (~1s vs potentially minutes).
 *         'full' backups include documents for complete disaster recovery.
 *
 * @param content - 'full' includes documents, 'database-only' skips them (default 'full' for backward compat).
 */
export function createBackup(
  db: Database.Database,
  backupDir: string,
  type: 'manual' | 'automatic' | 'pre_restore',
  dbPath: string,
  documentsDir?: string,
  content: 'database-only' | 'full' = 'full'
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

    // Build a timestamped filename: Backup_YYYY-MM-DD_HHmmssmsms.zip
    // CAVEAT: Without milliseconds, rapid successive backups (e.g. quick-backup + full backup)
    // within the same second produce identical filenames and silently overwrite each other on disk.
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, '0')}`
    const fileName = `Backup_${timestamp}.zip`
    const destPath = join(backupDir, fileName)

    const zip = new AdmZip()

    // Add SQLite database as database.db
    zip.addLocalFile(dbPath, '', 'database.db')

    // Add documents only for full backups — database-only backups skip them for speed
    if (content === 'full') {
      // Add documents folder if it exists
      const targetDocsDir = documentsDir ?? defaultDocumentsDir()
      if (targetDocsDir && existsSync(targetDocsDir)) {
        try {
          const files = readdirSync(targetDocsDir)
          if (files.length > 0) {
            zip.addLocalFolder(targetDocsDir, 'documents')
          }
        } catch (err) {
          logger.warn(
            'backupService',
            'Failed to add documents folder to backup',
            err instanceof Error ? err : undefined
          )
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
    }

    zip.writeZip(destPath)

    // Compute checksum
    const checksum = computeChecksum(destPath)

    // Log to backup_log
    db.prepare(
      `INSERT INTO backup_log (backup_file_path, backup_type, backup_content, file_size_kb, checksum, is_verified, status)
       VALUES (?, ?, ?, ?, ?, 1, 'success')`
    ).run(destPath, type, content, fileSizeKB(destPath), checksum)

    return { success: true, filePath: destPath, checksum }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Log failure
    try {
      db.prepare(
        `INSERT INTO backup_log (backup_file_path, backup_type, backup_content, file_size_kb, checksum, is_verified, status, error_message)
         VALUES (?, ?, 'full', NULL, NULL, 0, 'failed', ?)`
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
export function listBackups(db: Database.Database): BackupLogRow[] {
  return db.prepare('SELECT * FROM backup_log ORDER BY created_at DESC').all() as BackupLogRow[]
}

/**
 * Verify a backup file's integrity by recomputing its SHA-256 checksum
 * and comparing against the stored value (FR-BAK-06).
 */
export function verifyBackup(
  db: Database.Database,
  backupId: number
): { valid: boolean; error?: string } {
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
 * Result of a restore operation.
 * @property `closedLive` — true when the live DB connection was closed during the swap. The caller
 *           MUST restart the process (the existing `app:relaunch` handler does this). False in test
 *           mode where `db` is bound to a different file than `dbPath`.
 */
export interface RestoreResult {
  success: boolean
  emergencyBackupPath: string | null
  closedLive?: boolean
  error?: string
}

/** In-memory staged document: relative path under the documents dir → file bytes. */
interface StagedDocument {
  relPath: string
  data: Buffer
}

/**
 * Extract the `documents/` subtree of a ZIP into an in-memory list of staged documents.
 * INTENT: Stage in memory first so we can validate the DB BEFORE writing any documents to disk —
 *         a corrupt DB aborts before the documents directory is touched.
 */
function stageDocumentsFromZip(zip: AdmZip): StagedDocument[] {
  const staged: StagedDocument[] = []
  for (const entry of zip.getEntries()) {
    const normName = entry.entryName.replace(/\\/g, '/')
    if (!entry.isDirectory && normName.startsWith('documents/')) {
      const relPath = normName.substring('documents/'.length)
      if (relPath) {
        staged.push({ relPath, data: entry.getData() })
      }
    }
  }
  return staged
}

/** Write staged documents into `targetDocsDir`, creating subfolders as needed. */
function writeStagedDocuments(targetDocsDir: string, staged: StagedDocument[]): void {
  if (staged.length === 0) return
  if (!existsSync(targetDocsDir)) {
    mkdirSync(targetDocsDir, { recursive: true })
  }
  for (const doc of staged) {
    const destFilePath = join(targetDocsDir, doc.relPath)
    const destFolder = dirname(destFilePath)
    if (!existsSync(destFolder)) {
      mkdirSync(destFolder, { recursive: true })
    }
    writeFileSync(destFilePath, doc.data)
  }
}

/**
 * Restore database and uploaded documents from a backup.
 *
 * SAFE-RESTORE FLOW (B1 hardening):
 *   1. Verify backup SHA-256 checksum.
 *   2. Create a pre-restore emergency backup of the CURRENT state.
 *   3. PREPARE the candidate DB into a same-directory staging file (never write over the live file).
 *   4. INTEGRITY-CHECK the staging DB via `PRAGMA integrity_check` (rejects corrupt archives).
 *   5. Stage any documents IN MEMORY (so a failed DB swap leaves documents untouched).
 *   6. COMMIT: atomically swap the staging file into place (closing the live connection first),
 *      then write the staged documents.
 *
 * Discriminates ZIP vs legacy raw-SQLite backups by MAGIC BYTES — a corrupt zip never silently
 * falls through to the legacy path.
 *
 * FR-BAK-05, SRS §16 pre-restore safety backup.
 *
 * @returns `closedLive: true` when the live connection was closed — caller MUST restart the process.
 */
export function restoreFromBackup(
  db: Database.Database,
  backupId: number,
  backupDir: string,
  dbPath: string,
  documentsDir?: string
): RestoreResult {
  let stagingPath: string | null = null

  try {
    const row = db.prepare('SELECT * FROM backup_log WHERE id = ?').get(backupId) as
      BackupLogRow | undefined
    if (!row) return { success: false, emergencyBackupPath: null, error: 'Backup record not found' }
    if (!existsSync(row.backup_file_path)) {
      return { success: false, emergencyBackupPath: null, error: 'Backup file not found on disk' }
    }

    // 1. Verify integrity by SHA-256 checksum.
    const currentChecksum = computeChecksum(row.backup_file_path)
    if (row.checksum && currentChecksum !== row.checksum) {
      return {
        success: false,
        emergencyBackupPath: null,
        error: 'Checksum mismatch — backup may be corrupted'
      }
    }

    const targetDocsDir = documentsDir ?? defaultDocumentsDir()

    // 2. Pre-restore emergency backup of the CURRENT state (SRS §16).
    db.pragma('wal_checkpoint(TRUNCATE)')
    const emergencyResult = createBackup(db, backupDir, 'pre_restore', dbPath, targetDocsDir)
    const emergencyPath = emergencyResult.filePath

    // 3-4. PREPARE + INTEGRITY-CHECK the candidate DB into a staging file in the SAME directory
    //      as dbPath, so the commit rename is same-volume and atomic.
    stagingPath = join(dirname(resolve(dbPath)), `.restore-staging-${Date.now()}.db`)
    const format = detectBackupFormat(row.backup_file_path)
    let stagedDocs: StagedDocument[] = []

    if (format === 'zip') {
      // ZIP path — may throw on a corrupt-but-identifiable archive. We do NOT fall back silently.
      const zip = new AdmZip(row.backup_file_path)
      const dbEntry = zip.getEntry('database.db')
      if (!dbEntry) {
        return {
          success: false,
          emergencyBackupPath: emergencyPath,
          error: 'BACKUP_MISSING_DATABASE_ENTRY'
        }
      }
      writeFileSync(stagingPath, dbEntry.getData())

      // Stage documents in memory (full backup) or pull from the latest full backup (db-only).
      const hasDocuments = zip.getEntries().some((e) => {
        const norm = e.entryName.replace(/\\/g, '/')
        return !e.isDirectory && norm.startsWith('documents/')
      })

      if (hasDocuments) {
        stagedDocs = stageDocumentsFromZip(zip)
      } else {
        // Database-only backup — recover documents from the latest successful full backup.
        const latestFull = db
          .prepare(
            `SELECT backup_file_path FROM backup_log
             WHERE backup_content = 'full' AND status = 'success'
               AND backup_type != 'pre_restore'
               AND id != ? AND backup_file_path != ?
             ORDER BY created_at DESC LIMIT 1`
          )
          .get(backupId, row.backup_file_path) as { backup_file_path: string } | undefined

        if (latestFull && existsSync(latestFull.backup_file_path)) {
          // Best-effort: a failure here leaves stagedDocs empty — DB still restores.
          try {
            stagedDocs = stageDocumentsFromZip(new AdmZip(latestFull.backup_file_path))
          } catch {
            /* documents recovery is non-critical compared to DB */
          }
        }
      }
    } else if (format === 'sqlite') {
      // Legacy raw-SQLite backup. Copy to staging rather than over the live file.
      copyFileSync(row.backup_file_path, stagingPath)
    } else {
      return {
        success: false,
        emergencyBackupPath: emergencyPath,
        error: 'BACKUP_FORMAT_UNKNOWN'
      }
    }

    // 4. Integrity-check the staging DB. A non-'ok' result means the archive was structurally
    //    parseable but the DB content is damaged — reject before touching the live file.
    assertSqliteIntegrity(stagingPath)

    // 6. COMMIT: atomic swap (closes the live connection if it owns dbPath), then write documents.
    const swapResult = swapDatabaseFile(db, dbPath, stagingPath)
    stagingPath = null // ownership transferred to dbPath by the rename

    if (targetDocsDir && stagedDocs.length > 0) {
      writeStagedDocuments(targetDocsDir, stagedDocs)
    }

    return { success: true, emergencyBackupPath: emergencyPath, closedLive: swapResult.closedLive }
  } catch (err) {
    // Clean up the staging file if the swap never consumed it.
    if (stagingPath && existsSync(stagingPath)) {
      try {
        unlinkSync(stagingPath)
      } catch {
        /* best-effort cleanup */
      }
    }
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
  db: Database.Database,
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
export function deleteBackup(
  db: Database.Database,
  backupId: number
): { success: boolean; error?: string } {
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
    logger.warn('backupService', `Failed to delete backup file ${row.backup_file_path}`, err)
  }

  db.prepare('DELETE FROM backup_log WHERE id = ?').run(backupId)
  return { success: true }
}
