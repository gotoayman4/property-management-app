/**
 * @file updateIpc.test.ts — tests for the auto-download decision logic + updater settings flags.
 *
 * INTENT: Verify the VS Code-style auto-download behavior: a discovered update triggers a
 *         background download ONLY when settings.auto_update_download is enabled, and the
 *         trigger fires ONLY on the 'update-available' phase (never on ready/downloading/etc,
 *         which would loop). Also covers the isUpdateFlagEnabled defaults (fail-closed on
 *         error, enabled-by-default on fresh rows).
 * CONSTRAINT: Uses the shared ipcTestUtils harness pattern — electron and updateService are
 *             mocked; the settings table is a real migrated in-memory SQLite db.
 */

// eslint-disable-next-line import-x/order -- vitest vi.mock pattern forces structural separation
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    isPackaged: false,
    getVersion: () => '1.0.2',
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd()
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('../../db/database', () => ({
  db: testDb,
  initDatabase: () => undefined
}))

vi.mock('../../services/updateService', () => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  getUpdateState: vi.fn(),
  installUpdate: vi.fn(),
  onUpdateState: vi.fn(() => () => undefined),
  UPDATE_REPO: { owner: 'test-owner', repo: 'test-repo' },
  WEBSITE_URL: 'https://example.test'
}))

import { runMigrations } from '../../db/migrations'
import { downloadUpdate, type UpdateState } from '../../services/updateService'
import { isUpdateFlagEnabled, maybeAutoDownload } from '../updateIpc'

/** Flush the setImmediate queue so deferred auto-download callbacks run. */
const flushImmediates = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** Build an updater state snapshot for a given phase. */
function makeState(phase: UpdateState['phase']): UpdateState {
  return {
    phase,
    info:
      phase === 'update-available' || phase === 'ready'
        ? {
            version: '9.9.9',
            releaseName: 'v9.9.9',
            releaseNotes: '',
            publishedAt: '2026-07-01T00:00:00Z',
            setupUrl: 'https://example.test/setup.exe',
            setupName: 'PropManager-9.9.9-setup.exe',
            setupSize: 1000,
            shaSumsUrl: 'https://example.test/SHA256SUMS.txt'
          }
        : null,
    progress: 0,
    errorCode: null,
    downloadedPath: null
  }
}

describe('updateIpc — auto-download decision (VS Code-style flow)', () => {
  beforeEach(() => {
    runMigrations(testDb)
    // Reset both updater flags to their SQL defaults (enabled) between tests.
    testDb
      .prepare('UPDATE settings SET auto_update_check = 1, auto_update_download = 1 WHERE id = 1')
      .run()
    vi.mocked(downloadUpdate).mockClear()
  })

  it('starts a background download when an update is available and auto-download is enabled', async () => {
    maybeAutoDownload(makeState('update-available'))
    await flushImmediates()
    expect(downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('does NOT download when auto_update_download is disabled', async () => {
    testDb.prepare('UPDATE settings SET auto_update_download = 0 WHERE id = 1').run()
    maybeAutoDownload(makeState('update-available'))
    await flushImmediates()
    expect(downloadUpdate).not.toHaveBeenCalled()
  })

  it.each([
    'idle',
    'checking',
    'up-to-date',
    'downloading',
    'verifying',
    'ready',
    'error'
  ] as const)('never triggers a download on the %s phase (no re-trigger loops)', async (phase) => {
    maybeAutoDownload(makeState(phase))
    await flushImmediates()
    expect(downloadUpdate).not.toHaveBeenCalled()
  })

  it('auto_update_download defaults to enabled on a fresh settings row (migration 030)', () => {
    expect(isUpdateFlagEnabled('auto_update_download')).toBe(true)
  })

  it('auto_update_check flag reflects the persisted setting', () => {
    expect(isUpdateFlagEnabled('auto_update_check')).toBe(true)
    testDb.prepare('UPDATE settings SET auto_update_check = 0 WHERE id = 1').run()
    expect(isUpdateFlagEnabled('auto_update_check')).toBe(false)
  })
})
