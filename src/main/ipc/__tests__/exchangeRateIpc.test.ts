/**
 * @file exchangeRateIpc.test — tests for the exchange rate IPC handlers.
 *
 * INTENT: Verify Zod input validation on list, latest, and add handlers.
 *         Malformed payloads must throw INVALID_INPUT; valid payloads must not.
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
  ipcMain: { handle: vi.fn() },
  net: { fetch: vi.fn() }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))
vi.mock('../../utils/currencyHelper', () => ({
  getLatestRate: vi.fn().mockReturnValue(1.0)
}))

import { runMigrations } from '../../db/migrations'
import { registerExchangeRateIpcHandlers } from '../exchangeRateIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

describe('exchangeRateIpc', () => {
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
    registerExchangeRateIpcHandlers()
  })

  describe('exchangeRates:list input validation', () => {
    it('rejects non-object filter with INVALID_INPUT', async () => {
      await expect(invoke(registry, 'exchangeRates:list', 'bad')).rejects.toThrow('INVALID_INPUT')
    })

    it('rejects overly long currency_from with INVALID_INPUT', async () => {
      await expect(
        invoke(registry, 'exchangeRates:list', { currency_from: 'LONG' })
      ).rejects.toThrow('INVALID_INPUT')
    })

    it('accepts valid filter', async () => {
      const result = await invoke(registry, 'exchangeRates:list', {
        currency_from: 'USD',
        currency_to: 'JOD'
      })
      expect(result).toBeDefined()
    })

    it('accepts no argument (list all)', async () => {
      const result = await invoke(registry, 'exchangeRates:list')
      expect(result).toBeDefined()
    })
  })

  describe('exchangeRates:latest input validation', () => {
    it('rejects missing pair with INVALID_INPUT', async () => {
      await expect(invoke(registry, 'exchangeRates:latest', {})).rejects.toThrow('INVALID_INPUT')
    })

    it('rejects non-string currency codes with INVALID_INPUT', async () => {
      await expect(
        invoke(registry, 'exchangeRates:latest', {
          currency_from: 123,
          currency_to: 'JOD'
        })
      ).rejects.toThrow('INVALID_INPUT')
    })

    it('accepts valid pair', async () => {
      const result = await invoke(registry, 'exchangeRates:latest', {
        currency_from: 'USD',
        currency_to: 'JOD'
      })
      expect(result).toBeDefined()
    })
  })

  describe('exchangeRates:add input validation', () => {
    it('rejects missing required fields with INVALID_INPUT', async () => {
      await expect(invoke(registry, 'exchangeRates:add', { currency_from: 'USD' })).rejects.toThrow(
        'INVALID_INPUT'
      )
    })

    it('rejects invalid date format with INVALID_INPUT', async () => {
      await expect(
        invoke(registry, 'exchangeRates:add', {
          currency_from: 'USD',
          currency_to: 'JOD',
          rate: 0.71,
          effective_date: 'not-a-date'
        })
      ).rejects.toThrow('INVALID_INPUT')
    })

    it('rejects negative rate with INVALID_INPUT', async () => {
      await expect(
        invoke(registry, 'exchangeRates:add', {
          currency_from: 'USD',
          currency_to: 'JOD',
          rate: -1,
          effective_date: '2026-07-27'
        })
      ).rejects.toThrow('INVALID_INPUT')
    })
  })
})
