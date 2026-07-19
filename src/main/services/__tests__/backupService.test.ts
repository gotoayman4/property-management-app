/**
 * @file backupService.test.ts — unit tests for backup/restore operations.
 *
 * INTENT: Test all backupService functions with a temp directory + in-memory DB.
 * CONSTRAINT: Uses Database(':memory:') + fs.mkdtempSync for isolated filesystem tests.
 */

import { mkdtempSync, existsSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runMigrations } from '../../db/migrations'
import {
  createBackup,
  listBackups,
  verifyBackup,
  restoreFromBackup,
  pruneOldBackups,
  type BackupLogRow
} from '../backupService'

describe('backupService', () => {
  let db: Database.Database
  let backupDir: string

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)

    // Create a temp directory for backups
    backupDir = mkdtempSync(join(tmpdir(), 'backup-test-'))

    // Seed minimal data so we can verify it's backed up
    db.prepare(
      `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
       VALUES ('TEST-001', 'Test Property', 'apartment', 'JO', 'JOD', 'vacant', 500)`
    ).run()
    db.prepare(
      `INSERT INTO settings (id, app_language, theme, font_size, date_format)
       VALUES (1, 'ar', 'light', 'medium', 'YYYY-MM-DD')`
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
      const result = createBackup(db, backupDir, 'manual')

      expect(result.success).toBe(true)
      expect(result.filePath).toBeTruthy()
      expect(result.checksum).toBeTruthy()
      expect(existsSync(result.filePath!)).toBe(true)

      // Verify backup_log entry
      const logs = db.prepare('SELECT * FROM backup_log').all() as BackupLogRow[]
      expect(logs).toHaveLength(1)
      expect(logs[0].backup_type).toBe('manual')
      expect(logs[0].status).toBe('success')
      expect(logs[0].checksum).toBe(result.checksum)
      expect(logs[0].file_size_kb).toBeGreaterThan(0)
    })

    it('logs a failure entry when the backup directory is invalid', () => {
      const invalidDir = join(backupDir, 'nonexistent_subdir_that_cant_exist____', 'deep')
      const result = createBackup(db, invalidDir, 'automatic')

      // The attempt should fail — but the function catches the error and logs it
      expect(result.success).toBe(false)

      // The failure should be logged
      const logs = db.prepare('SELECT * FROM backup_log').all() as BackupLogRow[]
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].status).toBe('failed')
    })

    it('creates an automatic backup with the correct type label', () => {
      const result = createBackup(db, backupDir, 'automatic')
      expect(result.success).toBe(true)

      const log = db.prepare('SELECT * FROM backup_log').get() as BackupLogRow
      expect(log.backup_type).toBe('automatic')
    })
  })

  describe('listBackups (FR-BAK-07)', () => {
    it('returns an empty array when no backups exist', () => {
      const backups = listBackups(db)
      expect(backups).toEqual([])
    })

    it('returns backups in reverse chronological order', () => {
      const r1 = createBackup(db, backupDir, 'manual')
      const r2 = createBackup(db, backupDir, 'manual')
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
      const result = createBackup(db, backupDir, 'manual')
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
      const result = createBackup(db, backupDir, 'manual')
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
      const backupResult = createBackup(db, backupDir, 'manual')
      expect(backupResult.success).toBe(true)

      const logs = listBackups(db)

      // Use the in-memory DB's pragma to get a fake path for restore
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
        const r = createBackup(db, backupDir, 'manual')
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
      createBackup(db, backupDir, 'manual')
      const result = pruneOldBackups(db, 10)
      expect(result.deleted).toBe(0)
      expect(listBackups(db)).toHaveLength(1)
    })

    it('deletes the oldest files from disk', () => {
      for (let i = 0; i < 4; i++) {
        const r = createBackup(db, backupDir, 'manual')
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
})
