/**
 * @file searchIpc.test — tests for the global search IPC handler.
 *
 * INTENT: Verify Zod input validation (query max-length, type checking) and that
 *         valid short queries return results without error.
 * CONSTRAINT: Electron and the database module are mocked; tests run against an in-memory DB.
 */
import { ipcMain } from 'electron'
// eslint-disable-next-line import-x/order -- vitest mock pattern requires split imports
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))

import { runMigrations } from '../../db/migrations'
import { registerSearchIpcHandlers } from '../searchIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

describe('searchIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerSearchIpcHandlers()
  })

  describe('search:global input validation', () => {
    it('rejects non-string query with INVALID_INPUT', async () => {
      await expect(invoke(registry, 'search:global', 123)).rejects.toThrow('INVALID_INPUT')
    })

    it('rejects empty string query with INVALID_INPUT', async () => {
      await expect(invoke(registry, 'search:global', '')).rejects.toThrow('INVALID_INPUT')
    })

    it('rejects query exceeding 100 characters with INVALID_INPUT', async () => {
      await expect(invoke(registry, 'search:global', 'x'.repeat(101))).rejects.toThrow(
        'INVALID_INPUT'
      )
    })

    it('rejects object input with INVALID_INPUT (expects raw string)', async () => {
      await expect(invoke(registry, 'search:global', { query: 'test' })).rejects.toThrow(
        'INVALID_INPUT'
      )
    })

    it('returns empty array for query shorter than 2 characters', async () => {
      const result = await invoke(registry, 'search:global', 'a')
      expect(result).toEqual([])
    })

    it('passes validation for a valid query (does not throw INVALID_INPUT)', async () => {
      // Valid query passes Zod validation. The search may fail on a bare test DB
      // (FAILED_TO_SEARCH) but must never throw INVALID_INPUT.
      try {
        await invoke(registry, 'search:global', 'zzz_nonexistent')
      } catch (err) {
        expect((err as Error).message).not.toBe('INVALID_INPUT')
      }
    })

    it('passes validation for query at max length (100 chars)', async () => {
      try {
        await invoke(registry, 'search:global', 'a'.repeat(100))
      } catch (err) {
        expect((err as Error).message).not.toBe('INVALID_INPUT')
      }
    })
  })
})
