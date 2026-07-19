/**
 * @file dialogIpc.test — behavioural tests for the native folder-picker IPC handler.
 *
 * INTENT: verify the `dialog:pickFolder` contract without launching Electron:
 *   - happy path returns the chosen directory path.
 *   - cancel returns `{ filePath: null, canceled: true }`.
 *   - handler never throws — a dialog failure is reported as a cancelled result, not an exception,
 *     so the renderer can treat null/canceled identically.
 *
 * CONSTRAINT: Electron is mocked; `dialog.showOpenDialog` is stubbed per-test.
 */
import { ipcMain, dialog } from 'electron'
// eslint-disable-next-line import-x/order -- vitest vi.mock pattern forces structural separation
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd()
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  BrowserWindow: { getFocusedWindow: () => undefined }
}))

// The dialog service reads settings.backup_path; we don't need a real DB for these tests because
// resolveDefaultExportDir() falls back gracefully when the DB is unavailable. But to mirror the
// rest of the suite and avoid import-time crashes, we provide a stub.
vi.mock('../../db/database', () => ({
  db: {
    prepare: () => ({ get: () => null })
  },
  initDatabase: () => undefined
}))

import { registerDialogIpcHandlers } from '../dialogIpc'
import { makeRegistry, invoke, type IpcRegistry } from './ipcTestUtils'

describe('dialogIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (ch: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerDialogIpcHandlers()
  })

  describe('dialog:pickFolder', () => {
    it('returns the chosen directory path on success', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/home/user/backups']
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickFolder')) as {
        filePath: string | null
        canceled: boolean
      }

      expect(result.canceled).toBe(false)
      expect(result.filePath).toBe('/home/user/backups')
    })

    it('returns { filePath: null, canceled: true } when the user cancels', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: true,
        filePaths: []
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickFolder')) as {
        filePath: string | null
        canceled: boolean
      }

      expect(result.canceled).toBe(true)
      expect(result.filePath).toBeNull()
    })

    it('never throws — a dialog failure surfaces as a cancelled result', async () => {
      vi.mocked(dialog.showOpenDialog).mockRejectedValueOnce(new Error('dialog crashed'))

      const result = (await invoke(registry, 'dialog:pickFolder')) as {
        filePath: string | null
        canceled: boolean
      }

      expect(result.canceled).toBe(true)
      expect(result.filePath).toBeNull()
    })
  })
})
