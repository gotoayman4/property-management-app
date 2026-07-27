/**
 * @file backupService.test.ts — unit tests for backup/restore operations.
 *
 * INTENT: Test all backupService functions with a temp directory + in-memory DB.
 * CONSTRAINT: Uses Database(':memory:') + fs.mkdtempSync for isolated filesystem tests.
 */

import { createHash } from 'crypto'
import {
  mkdtempSync,
  existsSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  readFileSync,
  copyFileSync,
  readdirSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import AdmZip from 'adm-zip'
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runMigrations } from '../../db/migrations'
import {
  createBackup,
  listBackups,
  verifyBackup,
  restoreFromBackup,
  pruneOldBackups,
  deleteBackup,
  detectBackupFormat,
  verifyFileChecksum,
  type BackupLogRow
} from '../backupService'

describe('backupService', () => {
  let db: Database.Database
  let backupDir: string
  /**
   * INTENT: A real file-backed DB path — backups must read the on-disk file.
   * CONSTRAINT: Earlier versions used `:memory:` (where `PRAGMA database_list` returns NULL for
   *             `file`), masking the path-resolution bug. We now use a temp .db file so the
   *             backup service can actually copy bytes off disk.
   */
  let dbPath: string

  beforeEach(() => {
    backupDir = mkdtempSync(join(tmpdir(), 'backup-test-'))
    dbPath = join(backupDir, 'live.db')
    db = new Database(dbPath)
    db.pragma('foreign_keys = ON')
    runMigrations(db)

    // Seed minimal data so we can verify it's backed up.
    // NOTE: The `settings` singleton row (id=1) is already seeded by migration 001_initial_schema.sql,
    // so we must NOT insert a duplicate — that triggers `UNIQUE constraint failed: settings.id`.
    db.prepare(
      `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
       VALUES ('TEST-001', 'Test Property', 'apartment', 'JO', 'JOD', 'vacant', 500)`
    ).run()
  })

  afterEach(() => {
    db.close()
    // Clean up temp directory
    try {
      rmSync(backupDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  })

  describe('createBackup (FR-BAK-01/03/06/07)', () => {
    it('creates a backup file on disk and logs it', () => {
      const result = createBackup(db, backupDir, 'manual', dbPath)

      expect(result.success).toBe(true)
      expect(result.filePath).toBeTruthy()
      expect(result.checksum).toBeTruthy()
      expect(existsSync(result.filePath!)).toBe(true)

      // Verify backup_log entry
      const logs = db.prepare('SELECT * FROM backup_log').all() as BackupLogRow[]
      expect(logs).toHaveLength(1)
      expect(logs[0].backup_type).toBe('manual')
      expect(logs[0].backup_content).toBe('full')
      expect(logs[0].status).toBe('success')
      expect(logs[0].checksum).toBe(result.checksum)
      expect(logs[0].file_size_kb).toBeGreaterThan(0)
    })

    it('logs a failure entry when the backup directory is invalid', () => {
      // INTENT: Force a real failure. `mkdirSync(recursive: true)` happily creates deeply
      // nested missing dirs, so a non-existent path won't fail. We point backupDir at a
      // sub-path of an existing FILE — mkdir can't create a directory inside a file.
      const blockingFile = join(backupDir, 'blocking_file')
      writeFileSync(blockingFile, 'not a directory')
      const invalidDir = join(blockingFile, 'subdir')

      const result = createBackup(db, invalidDir, 'automatic', dbPath)

      // The attempt should fail — but the function catches the error and logs it
      expect(result.success).toBe(false)

      // The failure should be logged
      const logs = db.prepare('SELECT * FROM backup_log').all() as BackupLogRow[]
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].status).toBe('failed')
    })

    it('creates an automatic backup with the correct type label', () => {
      const result = createBackup(db, backupDir, 'automatic', dbPath)
      expect(result.success).toBe(true)

      const log = db.prepare('SELECT * FROM backup_log').get() as BackupLogRow
      expect(log.backup_type).toBe('automatic')
    })

    it('creates a database-only backup without documents in the ZIP', () => {
      const docsDir = join(backupDir, 'docs')
      mkdirSync(docsDir, { recursive: true })
      writeFileSync(join(docsDir, 'test.pdf'), 'PDF-CONTENT')

      const result = createBackup(db, backupDir, 'manual', dbPath, docsDir, 'database-only')
      expect(result.success).toBe(true)

      const zip = new AdmZip(result.filePath!)
      expect(zip.getEntry('database.db')).toBeTruthy()
      expect(zip.getEntry('documents/test.pdf')).toBeNull()

      const log = db.prepare('SELECT * FROM backup_log').get() as BackupLogRow
      expect(log.backup_content).toBe('database-only')
    })

    it('creates a full backup with documents in the ZIP', () => {
      const docsDir = join(backupDir, 'docs')
      mkdirSync(docsDir, { recursive: true })
      writeFileSync(join(docsDir, 'test.pdf'), 'PDF-CONTENT')

      const result = createBackup(db, backupDir, 'manual', dbPath, docsDir, 'full')
      expect(result.success).toBe(true)

      const zip = new AdmZip(result.filePath!)
      expect(zip.getEntry('database.db')).toBeTruthy()
      expect(zip.getEntry('documents/test.pdf')).toBeTruthy()

      const log = db.prepare('SELECT * FROM backup_log').get() as BackupLogRow
      expect(log.backup_content).toBe('full')
    })
  })

  describe('listBackups (FR-BAK-07)', () => {
    it('returns an empty array when no backups exist', () => {
      const backups = listBackups(db)
      expect(backups).toEqual([])
    })

    it('returns backups in reverse chronological order', () => {
      const r1 = createBackup(db, backupDir, 'manual', dbPath)
      const r2 = createBackup(db, backupDir, 'manual', dbPath)
      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)

      const backups = listBackups(db)
      expect(backups).toHaveLength(2)
      // Most recent first
      expect(new Date(backups[0].created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(backups[1].created_at).getTime()
      )
    })
  })

  describe('verifyBackup (FR-BAK-06)', () => {
    it('returns valid=true for a freshly created backup', () => {
      const result = createBackup(db, backupDir, 'manual', dbPath)
      expect(result.success).toBe(true)

      const logs = listBackups(db)
      expect(logs).toHaveLength(1)

      const verifyResult = verifyBackup(db, logs[0].id)
      expect(verifyResult.valid).toBe(true)
    })

    it('returns valid=false for a non-existent backup id', () => {
      const result = verifyBackup(db, 99999)
      expect(result.valid).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('returns valid=false when the backup file is missing from disk', () => {
      const result = createBackup(db, backupDir, 'manual', dbPath)
      expect(result.success).toBe(true)

      const logs = listBackups(db)

      // Delete the file from disk
      rmSync(logs[0].backup_file_path, { force: true })

      const verifyResult = verifyBackup(db, logs[0].id)
      expect(verifyResult.valid).toBe(false)
      expect(verifyResult.error).toContain('not found')
    })
  })

  describe('restoreFromBackup (FR-BAK-05)', () => {
    it('creates a pre-restore emergency backup ahead of the restore', () => {
      // Create a backup first
      const backupResult = createBackup(db, backupDir, 'manual', dbPath)
      expect(backupResult.success).toBe(true)

      const logs = listBackups(db)

      // Simulate a separate "current" DB file that will be overwritten by restore.
      // We can't reuse `dbPath` here because the live connection still holds it open;
      // a stand-in file is sufficient to prove the emergency-backup + overwrite flow.
      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'fake-db-content')

      const result = restoreFromBackup(db, logs[0].id, backupDir, fakeDbPath)
      expect(result.success).toBe(true)
      expect(result.emergencyBackupPath).toBeTruthy()
      expect(existsSync(result.emergencyBackupPath!)).toBe(true)

      // The pre-restore backup should be logged
      const allLogs = listBackups(db)
      const preRestoreLogs = allLogs.filter((l) => l.backup_type === 'pre_restore')
      expect(preRestoreLogs).toHaveLength(1)

      // Clean up the fake db file
      rmSync(fakeDbPath, { force: true })
    })

    it('fails when the backup record does not exist', () => {
      const result = restoreFromBackup(db, 99999, backupDir, '/fake/path.db')
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('pruneOldBackups (FR-BAK-04, BR-12)', () => {
    it('removes backups exceeding the limit (FIFO)', () => {
      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        const r = createBackup(db, backupDir, 'manual', dbPath)
        expect(r.success).toBe(true)
      }

      expect(listBackups(db)).toHaveLength(5)

      // Prune to keep 3
      const result = pruneOldBackups(db, 3)
      expect(result.deleted).toBe(2)

      const remaining = listBackups(db)
      expect(remaining).toHaveLength(3)
    })

    it('does nothing when under the limit', () => {
      createBackup(db, backupDir, 'manual', dbPath)
      const result = pruneOldBackups(db, 10)
      expect(result.deleted).toBe(0)
      expect(listBackups(db)).toHaveLength(1)
    })

    it('deletes the oldest files from disk', () => {
      for (let i = 0; i < 4; i++) {
        const r = createBackup(db, backupDir, 'manual', dbPath)
        expect(r.success).toBe(true)
      }

      // Record file paths before pruning
      const before = listBackups(db)
      const pathToBeDeleted = before[before.length - 1].backup_file_path // oldest

      pruneOldBackups(db, 3)

      // The oldest file should be gone from disk
      expect(existsSync(pathToBeDeleted)).toBe(false)
    })
  })

  describe('deleteBackup (per-row deletion)', () => {
    it('removes the backup record and its on-disk file', () => {
      const createResult = createBackup(db, backupDir, 'manual', dbPath)
      expect(createResult.success).toBe(true)
      const filePath = createResult.filePath!
      expect(existsSync(filePath)).toBe(true)

      const logs = listBackups(db)
      expect(logs).toHaveLength(1)

      const result = deleteBackup(db, logs[0].id)
      expect(result.success).toBe(true)

      // DB row gone, file gone
      expect(listBackups(db)).toHaveLength(0)
      expect(existsSync(filePath)).toBe(false)
    })

    it('returns success even if the file is already missing from disk (best-effort)', () => {
      const createResult = createBackup(db, backupDir, 'manual', dbPath)
      expect(createResult.success).toBe(true)
      const logs = listBackups(db)

      // Manually delete the file first — service should still clear the DB row.
      rmSync(createResult.filePath!, { force: true })

      const result = deleteBackup(db, logs[0].id)
      expect(result.success).toBe(true)
      expect(listBackups(db)).toHaveLength(0)
    })

    it('returns failure with an error when the backup record does not exist', () => {
      const result = deleteBackup(db, 99999)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('can delete a pre_restore (emergency) backup, not just success entries', () => {
      // Create a normal backup, then restore from it (which produces a pre_restore entry).
      const createResult = createBackup(db, backupDir, 'manual', dbPath)
      expect(createResult.success).toBe(true)
      const logs = listBackups(db)
      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'fake-db-content')
      const restoreResult = restoreFromBackup(db, logs[0].id, backupDir, fakeDbPath)
      expect(restoreResult.success).toBe(true)

      // Two entries now: the original manual + the pre_restore emergency backup.
      const allLogs = listBackups(db)
      const preRestore = allLogs.find((l) => l.backup_type === 'pre_restore')
      expect(preRestore).toBeTruthy()
      const emergencyFile = preRestore!.backup_file_path
      expect(existsSync(emergencyFile)).toBe(true)

      // Delete the pre_restore entry — deleteBackup is not limited to status='success'.
      const result = deleteBackup(db, preRestore!.id)
      expect(result.success).toBe(true)
      expect(existsSync(emergencyFile)).toBe(false)

      rmSync(fakeDbPath, { force: true })
    })
  })

  /**
   * REGRESSION: path resolution via `pragma('database_list', { simple: true })`.
   *
   * CONTEXT: The original createBackup resolved the DB file path with
   *   `db.pragma('database_list', { simple: true })`, expecting an array of rows.
   *   With `simple: true`, better-sqlite3 returns `.pluck().get()` — the FIRST COLUMN of the
   *   first row, which is the `seq` integer (0), NOT the file path. Every backup silently
   *   failed with "Could not resolve database path".
   *
   * These tests pin the contract: the caller supplies `dbPath`, and the copied backup
   * file actually contains the live database bytes (not an empty/placeholder file).
   */
  describe('path resolution regression (c6556f5 bug)', () => {
    it('copies the actual database file into the backup ZIP when dbPath is provided', () => {
      const result = createBackup(db, backupDir, 'manual', dbPath)
      expect(result.success).toBe(true)
      expect(result.filePath).toBeTruthy()

      // The backup file must be a valid ZIP archive containing database.db
      const zip = new AdmZip(result.filePath!)
      const dbEntry = zip.getEntry('database.db')
      expect(dbEntry).toBeTruthy()

      const restoredDbPath = join(backupDir, 'extracted_test.db')
      writeFileSync(restoredDbPath, dbEntry!.getData())

      const restored = new Database(restoredDbPath)
      const row = restored.prepare('SELECT code, name FROM properties LIMIT 1').get() as
        { code: string; name: string } | undefined
      restored.close()

      expect(row).toBeTruthy()
      expect(row!.code).toBe('TEST-001')
      expect(row!.name).toBe('Test Property')
    })

    it('fails explicitly when dbPath is empty', () => {
      const result = createBackup(db, backupDir, 'manual', '')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Could not resolve database path')
    })

    it('does not use pragma database_list with simple:true (the buggy call)', () => {
      // INTENT: Document the forbidden call shape so a future edit doesn't reintroduce it.
      // The `simple: true` option returns the `seq` column (0), not the file path.
      const buggyResult = db.pragma('database_list', { simple: true })
      expect(buggyResult).not.toBeInstanceOf(Array)
      // The buggy cast assumed `unknown[]` and indexed `[0][2]` to read the path.
      // With `simple: true` the result is the plucked first column — a number, not a row.
      expect(typeof buggyResult).toBe('number')
    })
  })

  describe('documents backup & restore', () => {
    it('packages uploaded document files into the backup archive and restores them', () => {
      const docsDir = join(backupDir, 'docs')
      const targetDocsDir = join(backupDir, 'restored_docs')
      mkdirSync(docsDir, { recursive: true })

      const sampleDocPath = join(docsDir, 'test_contract.pdf')
      writeFileSync(sampleDocPath, 'PDF-DUMMY-CONTENT')

      db.prepare(
        `INSERT INTO documents (entity_type, entity_id, file_name, file_path, mime_type, file_size)
         VALUES ('contract', 1, 'test_contract.pdf', ?, 'application/pdf', 16)`
      ).run(sampleDocPath)

      const backupResult = createBackup(db, backupDir, 'manual', dbPath, docsDir, 'full')
      expect(backupResult.success).toBe(true)

      const zip = new AdmZip(backupResult.filePath!)
      expect(zip.getEntry('database.db')).toBeTruthy()
      expect(zip.getEntry('documents/test_contract.pdf')).toBeTruthy()

      const logs = listBackups(db)
      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'fake-db-content')

      const restoreResult = restoreFromBackup(db, logs[0].id, backupDir, fakeDbPath, targetDocsDir)
      expect(restoreResult.success).toBe(true)

      const restoredDocPath = join(targetDocsDir, 'test_contract.pdf')
      expect(existsSync(restoredDocPath)).toBe(true)
      expect(readFileSync(restoredDocPath, 'utf8')).toBe('PDF-DUMMY-CONTENT')

      rmSync(fakeDbPath, { force: true })
    })

    it('restores legacy .db backups (raw SQLite file) via the integrity-checked path', () => {
      // INTENT: Legacy backups are raw .db files (no ZIP wrapper). The new safe-restore flow still
      // supports them via detectBackupFormat === 'sqlite', but now integrity-checks the file before
      // swapping it in. A real SQLite file passes; arbitrary junk would be rejected (covered by the
      // B1 'unknown format' and 'integrity check' regression tests).
      const legacyDbPath = join(backupDir, 'legacy_backup.db')
      const legacyConn = new Database(legacyDbPath)
      legacyConn.pragma('journal_mode = WAL')
      legacyConn.exec('CREATE TABLE legacy_marker (id INTEGER PRIMARY KEY, note TEXT)')
      legacyConn.prepare('INSERT INTO legacy_marker (note) VALUES (?)').run('from-legacy-backup')
      legacyConn.pragma('wal_checkpoint(TRUNCATE)')
      legacyConn.close()

      const dataBuffer = readFileSync(legacyDbPath)
      const sizeKb = Math.round(dataBuffer.length / 1024)
      const checksum = createHash('sha256').update(dataBuffer).digest('hex')
      const info = db
        .prepare(
          `INSERT INTO backup_log (backup_file_path, backup_type, backup_content, file_size_kb, checksum, is_verified, status)
           VALUES (?, 'manual', 'full', ?, ?, 1, 'success')`
        )
        .run(legacyDbPath, sizeKb, checksum)

      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'fake-db-content')

      const restoreResult = restoreFromBackup(
        db,
        Number(info.lastInsertRowid),
        backupDir,
        fakeDbPath
      )
      expect(restoreResult.success).toBe(true)

      // The restored file must be the legacy SQLite DB (provable by opening it and reading the marker).
      const restored = new Database(fakeDbPath)
      const row = restored.prepare('SELECT note FROM legacy_marker LIMIT 1').get() as
        { note: string } | undefined
      restored.close()
      expect(row?.note).toBe('from-legacy-backup')

      rmSync(fakeDbPath, { force: true })
    })
  })

  describe('database-only restore with 2-step document recovery', () => {
    it('restores documents from the latest full backup when restoring a database-only backup', () => {
      const docsDir = join(backupDir, 'docs')
      const targetDocsDir = join(backupDir, 'restored_docs')
      mkdirSync(docsDir, { recursive: true })

      const sampleDocPath = join(docsDir, 'important_contract.pdf')
      writeFileSync(sampleDocPath, 'IMPORTANT-DOC-CONTENT')

      // 1. Create a full backup with documents
      const fullResult = createBackup(db, backupDir, 'manual', dbPath, docsDir, 'full')
      expect(fullResult.success).toBe(true)

      // 2. Create a database-only backup (no documents)
      const dbOnlyResult = createBackup(db, backupDir, 'manual', dbPath, undefined, 'database-only')
      expect(dbOnlyResult.success).toBe(true)

      const logs = listBackups(db)
      const dbOnlyLog = logs.find((l) => l.backup_content === 'database-only')
      expect(dbOnlyLog).toBeTruthy()

      // Verify the database-only ZIP has no documents
      const dbOnlyZip = new AdmZip(dbOnlyLog!.backup_file_path)
      expect(dbOnlyZip.getEntry('database.db')).toBeTruthy()
      expect(dbOnlyZip.getEntries().some((e) => e.entryName.startsWith('documents/'))).toBe(false)

      // 3. Restore from the database-only backup
      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'fake-db-content')

      const restoreResult = restoreFromBackup(
        db,
        dbOnlyLog!.id,
        backupDir,
        fakeDbPath,
        targetDocsDir
      )
      expect(restoreResult.success).toBe(true)

      // 4. Verify documents were restored from the latest full backup
      const restoredDocPath = join(targetDocsDir, 'important_contract.pdf')
      expect(existsSync(restoredDocPath)).toBe(true)
      expect(readFileSync(restoredDocPath, 'utf8')).toBe('IMPORTANT-DOC-CONTENT')

      rmSync(fakeDbPath, { force: true })
    })

    it('restores DB only when no full backup exists for document recovery', () => {
      // Create only a database-only backup — no full backup exists
      const result = createBackup(db, backupDir, 'manual', dbPath, undefined, 'database-only')
      expect(result.success).toBe(true)

      const logs = listBackups(db)
      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'fake-db-content')

      const targetDocsDir = join(backupDir, 'restored_docs')
      const restoreResult = restoreFromBackup(db, logs[0].id, backupDir, fakeDbPath, targetDocsDir)
      expect(restoreResult.success).toBe(true)

      // No documents directory should be created since no full backup exists
      expect(existsSync(targetDocsDir)).toBe(false)

      rmSync(fakeDbPath, { force: true })
    })
  })

  /**
   * REGRESSION: B1 — restore hardening.
   *
   * CONTEXT: The previous restoreFromBackup (a) wrote over the open DB file with writeFileSync
   * (Windows EPERM/torn-write risk), and (b) swallowed ZIP-parse errors into a legacy copyFileSync
   * fallback that skipped integrity validation. A corrupt-but-identifiable archive could partially
   * restore documents then overwrite the DB.
   *
   * These tests pin the new contract: candidate DB is staged + integrity-checked before any swap,
   * unknown formats fail loudly, and ZIP errors do NOT silently fall through.
   */
  describe('restore hardening (B1 regression)', () => {
    it('detectBackupFormat identifies zip, sqlite, and unknown by magic bytes', () => {
      // ZIP archive
      const zipPath = join(backupDir, 'real.zip')
      const zip = new AdmZip()
      zip.addLocalFile(dbPath)
      zip.writeZip(zipPath)
      expect(detectBackupFormat(zipPath)).toBe('zip')

      // Raw SQLite file
      const sqliteCopy = join(backupDir, 'copy.db')
      copyFileSync(dbPath, sqliteCopy)
      expect(detectBackupFormat(sqliteCopy)).toBe('sqlite')

      // Arbitrary unknown bytes
      const junkPath = join(backupDir, 'junk.bin')
      writeFileSync(junkPath, 'this is not a backup')
      expect(detectBackupFormat(junkPath)).toBe('unknown')
    })

    it('verifyFileChecksum returns true when no expected checksum is stored (legacy rows)', () => {
      const f = join(backupDir, 'legacy.db')
      writeFileSync(f, 'LEGACY')
      expect(verifyFileChecksum(f, null)).toBe(true)
      expect(verifyFileChecksum(f, undefined)).toBe(true)
    })

    it('verifyFileChecksum detects a mismatch (corruption)', () => {
      const f = join(backupDir, 'tampered.db')
      writeFileSync(f, 'ORIGINAL')
      const checksum = createHash('sha256').update('ORIGINAL').digest('hex')
      expect(verifyFileChecksum(f, checksum)).toBe(true)
      // Tamper after computing the checksum
      writeFileSync(f, 'TAMPERED')
      expect(verifyFileChecksum(f, checksum)).toBe(false)
    })

    it('rejects an unknown-format backup file loudly (no silent legacy fallback)', () => {
      const junkPath = join(backupDir, 'junk.bin')
      writeFileSync(junkPath, 'definitely not a backup')
      const checksum = createHash('sha256').update('definitely not a backup').digest('hex')
      const info = db
        .prepare(
          `INSERT INTO backup_log (backup_file_path, backup_type, backup_content, file_size_kb, checksum, is_verified, status)
           VALUES (?, 'manual', 'full', 1, ?, 1, 'success')`
        )
        .run(junkPath, checksum)

      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'current')

      const result = restoreFromBackup(db, Number(info.lastInsertRowid), backupDir, fakeDbPath)
      expect(result.success).toBe(false)
      expect(result.error).toBe('BACKUP_FORMAT_UNKNOWN')
      // The live file must be untouched
      expect(readFileSync(fakeDbPath, 'utf8')).toBe('current')
    })

    it('rejects a ZIP whose database.db is missing (no silent legacy fallback)', () => {
      // Build a valid ZIP with NO database.db entry
      const zipPath = join(backupDir, 'no-db.zip')
      const zip = new AdmZip()
      zip.addFile('readme.txt', 'this zip has no database.db')
      zip.writeZip(zipPath)
      const checksum = createHash('sha256').update(readFileSync(zipPath)).digest('hex')

      const info = db
        .prepare(
          `INSERT INTO backup_log (backup_file_path, backup_type, backup_content, file_size_kb, checksum, is_verified, status)
           VALUES (?, 'manual', 'full', 1, ?, 1, 'success')`
        )
        .run(zipPath, checksum)

      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'current')

      const result = restoreFromBackup(db, Number(info.lastInsertRowid), backupDir, fakeDbPath)
      expect(result.success).toBe(false)
      expect(result.error).toBe('BACKUP_MISSING_DATABASE_ENTRY')
      expect(readFileSync(fakeDbPath, 'utf8')).toBe('current')
    })

    it('rejects a ZIP whose database.db is not a valid SQLite file (integrity check)', () => {
      const zipPath = join(backupDir, 'bad-db.zip')
      const zip = new AdmZip()
      // database.db present but contents are junk — passes the entry check, fails integrity_check
      zip.addFile('database.db', 'not a sqlite database')
      zip.writeZip(zipPath)
      const checksum = createHash('sha256').update(readFileSync(zipPath)).digest('hex')

      const info = db
        .prepare(
          `INSERT INTO backup_log (backup_file_path, backup_type, backup_content, file_size_kb, checksum, is_verified, status)
           VALUES (?, 'manual', 'full', 1, ?, 1, 'success')`
        )
        .run(zipPath, checksum)

      const fakeDbPath = join(backupDir, 'current.db')
      writeFileSync(fakeDbPath, 'current')

      const result = restoreFromBackup(db, Number(info.lastInsertRowid), backupDir, fakeDbPath)
      expect(result.success).toBe(false)
      // The DB cannot even be opened by better-sqlite3; the service surfaces the underlying error.
      expect(result.error).toBeTruthy()
      expect(readFileSync(fakeDbPath, 'utf8')).toBe('current')

      // Staging file must be cleaned up — no .restore-staging-* leftovers in the dir
      const leftovers = readdirSync(backupDir).filter((f) => f.startsWith('.restore-staging-'))
      expect(leftovers).toHaveLength(0)
    })

    it('restores a valid ZIP via the staging path and swaps the live file atomically', () => {
      // Source backup of the real migrated DB
      const backupResult = createBackup(db, backupDir, 'manual', dbPath)
      expect(backupResult.success).toBe(true)
      const logs = listBackups(db)

      // The "live" file we restore into is a SEPARATE path from the connection's own file,
      // so swapDatabaseFile leaves the connection open (test-mode contract). The swap still
      // atomically renames the staging file into place.
      const targetDbPath = join(backupDir, 'current.db')
      writeFileSync(targetDbPath, 'current')

      const result = restoreFromBackup(db, logs[0].id, backupDir, targetDbPath)
      expect(result.success).toBe(true)
      // In test mode the connection is on dbPath, not targetDbPath → closedLive is false.
      expect(result.closedLive).toBe(false)

      // The restored file is a real SQLite DB containing the seeded property
      const restored = new Database(targetDbPath)
      const row = restored.prepare('SELECT code FROM properties LIMIT 1').get() as
        { code: string } | undefined
      restored.close()
      expect(row?.code).toBe('TEST-001')

      // No staging leftovers
      const leftovers = readdirSync(backupDir).filter((f) => f.startsWith('.restore-staging-'))
      expect(leftovers).toHaveLength(0)
    })

    it('reports closedLive=true when restoring into the connection’s own file path', () => {
      // Create a backup, then restore it back into the connection's OWN file.
      // After the swap, the live connection is closed — the test reopens the file to assert content.
      const backupResult = createBackup(db, backupDir, 'manual', dbPath)
      expect(backupResult.success).toBe(true)
      const logs = listBackups(db)

      // Mutate the live DB so we can prove the restore reverted it
      db.prepare("UPDATE properties SET name = 'MUTATED' WHERE code = 'TEST-001'").run()

      const result = restoreFromBackup(db, logs[0].id, backupDir, dbPath)
      expect(result.success).toBe(true)
      expect(result.closedLive).toBe(true)

      // The swap closed the original `db`. Reopen the (now swapped) file and confirm the mutation
      // was reverted by the restore. Reassign the outer-scope `db` so afterEach closes this one
      // instead of the dead connection.
      db = new Database(dbPath)
      const row = db.prepare('SELECT name FROM properties LIMIT 1').get() as
        { name: string } | undefined
      expect(row?.name).toBe('Test Property')

      // The original file should have been preserved as dbPath.bak
      expect(existsSync(`${dbPath}.bak`)).toBe(true)
    })
  })
})
