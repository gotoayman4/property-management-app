/**
 * @file dialogIpc — IPC handlers for native OS dialogs (file/folder pickers).
 *
 * INTENT: The ONLY place where the renderer can trigger a native open/save dialog. Each handler
 *         returns the user's choice; the renderer decides whether to persist it (e.g. via
 *         `settings:update`). This keeps the trust boundary tight — the dialog service never
 *         writes settings or files on the renderer's behalf beyond what the dialog explicitly
 *         returns.
 *
 * CONSTRAINTS:
 *   - NFR-SEC-06: no input payload for `dialog:pickFolder` (the only argument is the implicit
 *                 parent window), so no Zod validation is needed today. If a future dialog handler
 *                 accepts renderer-supplied options, it MUST validate them with Zod first.
 *   - AGENTS.md: no renderer filesystem access. The folder picker is the user's explicit consent
 *             to a directory choice; subsequent writes happen through other handlers (backup,
 *             export) that already enforce their own constraints.
 *   - AGENTS.md / NFR-SEC-04: `dialog:pickImage` MUST validate the selected file by magic bytes
 *             (file-type@16.5.4), never trust the extension. SVG is rejected (text-based, no magic
 *             bytes, can carry <script> and is inlined as a data URI in the renderer).
 *
 * DECISION: Lives in its own file (not bolted onto propertyIpc.ts or backupIpc.ts) because dialog
 *           concerns are orthogonal to both. Future dialog channels (color picker, file picker for
 *           imports, etc.) belong here.
 */

import * as fs from 'fs'
import { join } from 'path'
import { dialog, BrowserWindow, ipcMain } from 'electron'
import { fromBuffer } from 'file-type'
import { z } from 'zod'
import { writeFileAtomic } from '../services/exportService/exportUtils'
import { resolveDefaultExportDir, showOpenDirectoryDialog } from '../services/fileDialogService'
import { logger } from '../utils/logger'

/**
 * Magic-byte MIME types accepted for the company logo (a strict subset of the documents whitelist).
 * SVG is intentionally absent — it has no magic bytes and can execute script when inlined.
 */
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png'])

/**
 * Hard cap on logo file size. Logos are tiny display assets; cap well below the document 10 MB limit
 * so a user can't accidentally inline a multi-megabyte image into settings (and thus every receipt).
 */
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024

export function registerDialogIpcHandlers(): void {
  /**
   * dialog:pickFolder — Open the native folder picker and return the chosen directory.
   */
  ipcMain.handle('dialog:pickFolder', async () => {
    try {
      return await showOpenDirectoryDialog()
    } catch (error) {
      logger.error('Folder picker dialog error', error)
      return { filePath: null, canceled: true }
    }
  })

  /**
   * dialog:pickImage — Open the native file picker to select a company logo image,
   * returning it encoded as a base64 data URI.
   *
   * SECURITY (B2 hardening): the selected file is validated by MAGIC BYTES via file-type@16.5.4
   * before being inlined. The client-supplied extension is never trusted. SVG is rejected
   * (no magic bytes; can carry <script> and is rendered as an inlined data URI in the renderer).
   *
   * Return contract:
   *   - success: `{ base64, canceled: false }`
   *   - user cancel: `{ base64: null, canceled: true }`
   *   - validation failure: `{ base64: null, canceled: true, error: <machine code> }`
   *     The renderer shows a localized toast for `error` (IMAGE_TOO_LARGE / INVALID_IMAGE_TYPE /
   *     IMAGE_EMPTY) so the user understands why their selection wasn't accepted.
   */
  ipcMain.handle('dialog:pickImage', async () => {
    try {
      const focused = BrowserWindow.getFocusedWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Select Company Logo',
        // Filter is cosmetic (UX); enforcement happens by magic byte below.
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
        properties: ['openFile']
      }
      const result = focused
        ? await dialog.showOpenDialog(focused, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || !result.filePaths[0]) {
        return { base64: null, canceled: true }
      }

      const selectedPath = result.filePaths[0]
      const buffer = fs.readFileSync(selectedPath)

      // Magic-byte validation — mirror the document uploader's discipline.
      if (buffer.byteLength === 0) {
        return { base64: null, canceled: true, error: 'IMAGE_EMPTY' }
      }
      if (buffer.byteLength > MAX_LOGO_SIZE_BYTES) {
        return { base64: null, canceled: true, error: 'IMAGE_TOO_LARGE' }
      }
      const detected = await fromBuffer(buffer)
      if (!detected || !ALLOWED_IMAGE_MIMES.has(detected.mime)) {
        // SVG, GIF, BMP, webp, and any extension-spoofed file land here.
        return { base64: null, canceled: true, error: 'INVALID_IMAGE_TYPE' }
      }

      const base64 = `data:${detected.mime};base64,${buffer.toString('base64')}`
      return { base64, canceled: false }
    } catch (error) {
      logger.error('Image picker error', error)
      return { base64: null, canceled: true }
    }
  })

  /**
   * dialog:pickBackupFile — Open native file picker for selecting a .db backup file from disk.
   */
  ipcMain.handle('dialog:pickBackupFile', async () => {
    try {
      const focused = BrowserWindow.getFocusedWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Select Backup File',
        filters: [
          { name: 'Backup Archives (*.zip, *.db)', extensions: ['zip', 'db'] },
          { name: 'ZIP Archives (*.zip)', extensions: ['zip'] },
          { name: 'Database Files (*.db)', extensions: ['db'] },
          { name: 'All Files (*)', extensions: ['*'] }
        ],
        properties: ['openFile']
      }
      const result = focused
        ? await dialog.showOpenDialog(focused, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || !result.filePaths[0]) {
        return { filePath: null, canceled: true }
      }

      return { filePath: result.filePaths[0], canceled: false }
    } catch (error) {
      logger.error('Backup file picker error', error)
      return { filePath: null, canceled: true }
    }
  })

  /**
   * dialog:saveReceiptImage — Save a PNG buffer of the rendered receipt to disk.
   *
   * INTENT: The renderer rasterizes the receipt DOM (html-to-image → PNG data URL) and hands
   *         the bytes here; this handler is the user's consent gate for WHERE to write, and
   *         performs the actual disk write (BR-31 discipline — no renderer filesystem access).
   *
   * SECURITY: payload validated with Zod; the base64 payload must be a data:image/png URI.
   *           A hard cap mirrors MAX_LOGO_SIZE_BYTES so a renderer bug can't spill huge
   *           buffers to disk. Write is atomic via writeFileAtomic.
   */
  ipcMain.handle(
    'dialog:saveReceiptImage',
    async (_, payload: unknown): Promise<{ filePath: string | null; canceled: boolean }> => {
      try {
        const parsed = z
          .object({
            /** data:image/png;base64,... produced by html-to-image in the renderer. */
            dataUrl: z
              .string()
              .startsWith('data:image/png;base64,')
              .max(30 * 1024 * 1024),
            /** Suggested file name, sanitized below. */
            fileName: z.string().min(1).max(120)
          })
          .parse(payload)

        const safeName = parsed.fileName
          .replace(/[<>:"/\\|?*]/g, '_')
          .replace(/\s+/g, ' ')
          .trim()
        const defaultDir = resolveDefaultExportDir()
        const focused = BrowserWindow.getFocusedWindow()
        const options = {
          title: 'Save receipt image',
          defaultPath: join(defaultDir, `${safeName}.png`),
          filters: [{ name: 'PNG', extensions: ['png'] }]
        }
        const result = focused
          ? await dialog.showSaveDialog(focused, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { filePath: null, canceled: true }

        const base64 = parsed.dataUrl.slice('data:image/png;base64,'.length)
        await writeFileAtomic(result.filePath, Buffer.from(base64, 'base64'))
        return { filePath: result.filePath, canceled: false }
      } catch (error) {
        logger.error('Receipt image save error', error)
        if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
        throw new Error('EXPORT_WRITE_FAILED')
      }
    }
  )
}
