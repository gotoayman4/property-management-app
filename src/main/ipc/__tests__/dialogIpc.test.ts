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
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ipcMain, dialog } from 'electron'
// eslint-disable-next-line import-x/order -- vitest vi.mock pattern forces structural separation
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

  /**
   * REGRESSION: B2 — `dialog:pickImage` magic-byte validation.
   *
   * CONTEXT: The previous handler trusted the file extension and accepted SVG. SVG has no magic
   * bytes and can carry <script>; it was inlined as a data URI in the renderer. The fix validates
   * the buffer via file-type@16.5.4 (the same library the document uploader uses) and rejects
   * anything that isn't a real PNG/JPEG.
   *
   * These tests use REAL files on disk (a tiny valid PNG and synthetic SVG/junk files) so the
   * `fromBuffer` call runs against actual bytes, not mocks.
   */
  describe('dialog:pickImage — magic-byte validation (B2 regression)', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'pickimage-'))
    })

    afterEach(() => {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    })

    /**
     * Minimal valid PNG: 8-byte signature + IHDR chunk (13 bytes) + IEND chunk.
     * file-type@16 needs the signature + at least the start of IHDR to identify image/png.
     */
    const MIN_PNG = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
      // IHDR chunk: length=13, type="IHDR", 13 bytes of data, CRC
      Buffer.from([
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde
      ]),
      // IEND chunk
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
    ])

    it('accepts a real PNG by magic bytes and returns a data URI', async () => {
      const pngPath = join(tmpDir, 'logo.png')
      writeFileSync(pngPath, MIN_PNG)
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: [pngPath]
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickImage')) as {
        base64: string | null
        canceled: boolean
        error?: string
      }

      expect(result.canceled).toBe(false)
      expect(result.base64).toBeTruthy()
      expect(result.base64!.startsWith('data:image/png;base64,')).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects an SVG even with a .png extension (extension spoofing)', async () => {
      // An SVG renamed to .png — file-type sees the text bytes, returns undefined.
      const spoofedPath = join(tmpDir, 'sneaky.png')
      writeFileSync(
        spoofedPath,
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      )
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: [spoofedPath]
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickImage')) as {
        base64: string | null
        canceled: boolean
        error?: string
      }

      expect(result.canceled).toBe(true)
      expect(result.base64).toBeNull()
      expect(result.error).toBe('INVALID_IMAGE_TYPE')
    })

    it('rejects an explicitly-named .svg file', async () => {
      const svgPath = join(tmpDir, 'logo.svg')
      writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"/>')
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: [svgPath]
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickImage')) as {
        base64: string | null
        canceled: boolean
        error?: string
      }

      expect(result.canceled).toBe(true)
      expect(result.base64).toBeNull()
      expect(result.error).toBe('INVALID_IMAGE_TYPE')
    })

    it('rejects an empty file with IMAGE_EMPTY', async () => {
      const emptyPath = join(tmpDir, 'empty.png')
      writeFileSync(emptyPath, Buffer.alloc(0))
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: [emptyPath]
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickImage')) as {
        base64: string | null
        canceled: boolean
        error?: string
      }

      expect(result.canceled).toBe(true)
      expect(result.error).toBe('IMAGE_EMPTY')
    })

    it('rejects an oversized file with IMAGE_TOO_LARGE', async () => {
      const hugePath = join(tmpDir, 'huge.png')
      // 6 MB of zero bytes — exceeds the 5 MB logo cap. Prefix with a valid PNG signature so the
      // size check fires before fromBuffer would even run.
      const buf = Buffer.concat([MIN_PNG.subarray(0, 8), Buffer.alloc(6 * 1024 * 1024)])
      writeFileSync(hugePath, buf)
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: [hugePath]
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickImage')) as {
        base64: string | null
        canceled: boolean
        error?: string
      }

      expect(result.canceled).toBe(true)
      expect(result.error).toBe('IMAGE_TOO_LARGE')
    })

    it('returns canceled=true (no error) when the user dismisses the dialog', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: true,
        filePaths: []
      } as Electron.OpenDialogReturnValue)

      const result = (await invoke(registry, 'dialog:pickImage')) as {
        base64: string | null
        canceled: boolean
        error?: string
      }

      expect(result.canceled).toBe(true)
      expect(result.base64).toBeNull()
      expect(result.error).toBeUndefined()
    })
  })
})
