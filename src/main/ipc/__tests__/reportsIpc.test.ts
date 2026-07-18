/**
 * @file reportsIpc.test — behavioural tests for the Reports IPC handlers.
 *
 * INTENT: verify the IPC contract without launching Electron:
 *   - NFR-SEC-06: bad payloads are rejected with INVALID_INPUT.
 *   - NFR-SEC-07: error responses are stable machine-readable codes, never stack traces.
 *   - reports:preview returns the normalized ReportData shape.
 *   - reports:exportExcel / reports:exportHtml write a file to a temp path and return it.
 *
 * CONSTRAINT: Electron and the save dialog are mocked; a temp dir holds the exported files.
 */
import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest'
import { ipcMain } from 'electron'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

// Mock Electron: ipcMain captures handlers; dialog returns a deterministic temp path.
// The fileDialogService picks the 1-arg or 2-arg showSaveDialog overload based on whether a
// window is focused, so the mock must accept either call shape.
const tempDir = mkdtempSync(join(tmpdir(), 'reports-ipc-'))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tempDir
  },
  dialog: {
    showSaveDialog: vi.fn(async (...args) => {
      // The options object is the last argument regardless of 1-arg or 2-arg form.
      const opts = args[args.length - 1] as { defaultPath: string }
      return {
        canceled: false,
        filePath: join(tempDir, opts.defaultPath.split(/[\\/]/).pop() ?? 'export.bin')
      }
    })
  },
  BrowserWindow: { getFocusedWindow: () => undefined },
  session: { defaultSession: { webRequest: { onHeadersReceived: () => undefined } } }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))

import { registerReportsIpcHandlers } from '../reportsIpc'
import { runMigrations } from '../../db/migrations'
import { dialog } from 'electron'

describe('reportsIpc', () => {
  let registry: IpcRegistry
  let propertyId: number

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerReportsIpcHandlers()

    // Seed one property + one payment so the income report has data.
    const prop = testDb
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('RP-1', 'Report Property', 'apartment', 'JO', 'JOD', 'rented', 500)`
      )
      .run()
    propertyId = Number(prop.lastInsertRowid)
    testDb
      .prepare(
        `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency, receipt_number)
         VALUES (?, 'rent', '2026-07-01', 500, 'JOD', 'RP-RCT-1')`
      )
      .run(propertyId)
  })

  it('rejects a payload missing the report type with INVALID_INPUT', async () => {
    await expect(invoke(registry, 'reports:preview', { from_date: '2026-07-01' })).rejects.toThrow(
      'INVALID_INPUT'
    )
  })

  it('rejects a malformed date with INVALID_INPUT', async () => {
    await expect(
      invoke(registry, 'reports:preview', { type: 'income', from_date: '07/01/2026' })
    ).rejects.toThrow('INVALID_INPUT')
  })

  it('returns a normalized ReportData shape on preview', async () => {
    const result = (await invoke(registry, 'reports:preview', {
      type: 'income',
      language: 'en'
    })) as { titleKey: string; columns: unknown[]; groups: unknown[] }
    expect(result.titleKey).toBe('reports.type.income')
    expect(result.columns.length).toBeGreaterThan(0)
    expect(result.groups.length).toBe(1)
  })

  it('exportExcel writes a .xlsx file and returns its path', async () => {
    const result = (await invoke(registry, 'reports:exportExcel', {
      type: 'income',
      language: 'en'
    })) as { filePath: string }
    expect(result.filePath).toBeTruthy()
    expect(existsSync(result.filePath)).toBe(true)
    const buffer = readFileSync(result.filePath)
    // ZIP magic bytes for .xlsx.
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })

  it('exportHtml writes a self-contained .html file (BR-31)', async () => {
    const result = (await invoke(registry, 'reports:exportHtml', {
      type: 'income',
      language: 'en'
    })) as { filePath: string }
    expect(result.filePath).toBeTruthy()
    const html = readFileSync(result.filePath, 'utf-8')
    expect(html).toMatch(/<html dir="ltr" lang="en">/)
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=/i)
  })

  it('rejects an empty result with REPORT_NO_DATA, never writes a file', async () => {
    // No payments in the future — narrow the window to guarantee zero rows.
    // The dialog is never reached (REPORT_NO_DATA throws before it), so we assert the call count
    // stayed flat rather than mocking a response that would never be consumed.
    const callsBefore = vi.mocked(dialog.showSaveDialog).mock.calls.length
    await expect(
      invoke(registry, 'reports:exportExcel', {
        type: 'income',
        from_date: '2099-01-01',
        to_date: '2099-12-31'
      })
    ).rejects.toThrow('REPORT_NO_DATA')
    expect(vi.mocked(dialog.showSaveDialog).mock.calls.length).toBe(callsBefore)
  })

  it('returns { filePath: null } when the user cancels the save dialog', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: true,
      filePath: ''
    })
    const result = (await invoke(registry, 'reports:exportHtml', {
      type: 'income'
    })) as { filePath: string | null }
    expect(result.filePath).toBeNull()
  })

  afterAll(() => {
    // Tidy up temp files; failures here do not fail the suite.
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })
})
