/**
 * @file backupIpc.test.ts — IPC handler tests for backup/restore (SRS Module 11).
 *
 * INTENT: Test each IPC channel end-to-end: create, list, verify, restore (two-phase), prune.
 * CONTRAINT: Uses the shared ipcTestUtils harness and the vi.hoisted in-memory DB pattern
 *            (see phase2aIpc.test.ts for the canonical approach).
 */

import { mkdtempSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ipcMain } from 'electron'
// eslint-disable-next-line import-x/order -- vitest vi.mock pattern forces structural separation
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * INTENT: Create a file-backed DB before any module mocking.
 * CONSTRAINT: Earlier versions used `:memory:`, but `backup:create` copies the DB FILE off disk.
 *             With `:memory:` there is no file to copy — the test falsely "passed" by side-effect.
 *             Using a real temp file makes the IPC test exercise the same code path as production.
 */
const { testDb, testDbPath } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const Database = require('better-sqlite3')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const { mkdtempSync } = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const { tmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const { join } = require('path')
  const dir = mkdtempSync(join(tmpdir(), 'backup-ipc-db-'))
  const path = join(dir, 'live.db')
  const db = new Database(path)
  db.pragma('foreign_keys = ON')
  return { testDb: db, testDbPath: path }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
    relaunch: vi.fn(),
    exit: vi.fn()
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

vi.mock('../../db/database', () => ({
  db: testDb,
  dbPath: testDbPath,
  initDatabase: () => undefined
}))

import { runMigrations } from '../../db/migrations'
import { registerBackupIpcHandlers } from '../backupIpc'
import { makeRegistry, type IpcRegistry, invoke, resetDb } from './ipcTestUtils'

describe('backupIpc', () => {
  let registry: IpcRegistry
  let backupDir: string

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    backupDir = mkdtempSync(join(tmpdir(), 'backup-ipc-test-'))

    // Seed settings with a valid backup path.
    // NOTE: Migration 001_initial_schema.sql already seeds the singleton settings row (id=1),
    // so we UPDATE rather than INSERT to avoid `UNIQUE constraint failed: settings.id`.
    testDb
      .prepare('UPDATE settings SET backup_path = ?, max_backup_count = 10 WHERE id = 1')
      .run(backupDir)

    // Seed a property + tenant for data integrity
    testDb
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
       VALUES ('IPCTEST-001', 'IPC Test Property', 'apartment', 'JO', 'JOD', 'vacant', 500)`
      )
      .run()

    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (ch: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerBackupIpcHandlers()
  })

  afterEach(() => {
    resetDb(testDb)
    try {
      rmSync(backupDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  })

  describe('backup:create (FR-BAK-01)', () => {
    it('creates a manual backup and returns success with file path and checksum', async () => {
      const result = (await invoke(registry, 'backup:create')) as {
        success: boolean
        filePath: string | null
        checksum: string | null
      }

      expect(result.success).toBe(true)
      expect(result.filePath).toBeTruthy()
      expect(result.checksum).toBeTruthy()
      expect(existsSync(result.filePath!)).toBe(true)
    })
  })

  describe('backup:list (FR-BAK-07)', () => {
    it('returns an empty list when no backups exist', async () => {
      const result = (await invoke(registry, 'backup:list')) as unknown[]
      expect(result).toEqual([])
    })

    it('returns backups after creation', async () => {
      await invoke(registry, 'backup:create')
      const result = (await invoke(registry, 'backup:list')) as { id: number }[]
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('backup:verify (FR-BAK-06)', () => {
    it('returns valid=true for a freshly created backup', async () => {
      await invoke(registry, 'backup:create')
      const list = (await invoke(registry, 'backup:list')) as { id: number }[]
      const result = (await invoke(registry, 'backup:verify', {
        backupId: list[0].id
      })) as { valid: boolean }
      expect(result.valid).toBe(true)
    })

    it('rejects invalid input', async () => {
      await expect(
        invoke(registry, 'backup:verify', { backupId: 'not-a-number' })
      ).rejects.toThrow()
    })
  })

  describe('backup:restore (FR-BAK-05) — two-phase', () => {
    it('phase 1 returns backup info for confirmation', async () => {
      await invoke(registry, 'backup:create')
      const list = (await invoke(registry, 'backup:list')) as { id: number }[]

      const phase1 = (await invoke(registry, 'backup:restore', {
        backupId: list[0].id,
        confirm: false
      })) as { confirmed: boolean; backupInfo: unknown }

      expect(phase1.confirmed).toBe(false)
      expect(phase1.backupInfo).toBeTruthy()
    })
  })

  describe('backup:prune (FR-BAK-04)', () => {
    it('prunes old backups beyond the retention limit', async () => {
      // Create several backups
      await invoke(registry, 'backup:create')
      await invoke(registry, 'backup:create')

      // Set a low retention limit
      testDb.prepare('UPDATE settings SET max_backup_count = 1 WHERE id = 1').run()

      const result = (await invoke(registry, 'backup:prune')) as { deleted: number }
      expect(result.deleted).toBeGreaterThan(0)
    })
  })

  describe('backup:delete (per-row deletion)', () => {
    it('deletes a single backup and returns success', async () => {
      await invoke(registry, 'backup:create')
      const listBefore = (await invoke(registry, 'backup:list')) as { id: number }[]
      expect(listBefore.length).toBe(1)

      const result = (await invoke(registry, 'backup:delete', {
        backupId: listBefore[0].id
      })) as { success: boolean }

      expect(result.success).toBe(true)
      const listAfter = (await invoke(registry, 'backup:list')) as unknown[]
      expect(listAfter).toHaveLength(0)
    })

    it('rejects invalid input (non-positive id)', async () => {
      await expect(invoke(registry, 'backup:delete', { backupId: 0 })).rejects.toThrow()
      await expect(
        invoke(registry, 'backup:delete', { backupId: 'not-a-number' })
      ).rejects.toThrow()
    })
  })

  describe('app:relaunch (FR-BAK-05 post-restore restart)', () => {
    it('calls app.relaunch() and app.exit(0) to restart the app', async () => {
      const { app } = await import('electron')
      await invoke(registry, 'app:relaunch')
      expect(vi.mocked(app.relaunch)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(app.exit)).toHaveBeenCalledWith(0)
    })
  })
})
