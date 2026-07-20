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
 *
 * DECISION: Lives in its own file (not bolted onto propertyIpc.ts or backupIpc.ts) because dialog
 *           concerns are orthogonal to both. Future dialog channels (color picker, file picker for
 *           imports, etc.) belong here.
 */

import * as fs from 'fs'
import * as path from 'path'
import { dialog, BrowserWindow, ipcMain } from 'electron'
import { showOpenDirectoryDialog } from '../services/fileDialogService'

export function registerDialogIpcHandlers(): void {
  /**
   * dialog:pickFolder — Open the native folder picker and return the chosen directory.
   */
  ipcMain.handle('dialog:pickFolder', async () => {
    try {
      return await showOpenDirectoryDialog()
    } catch (error) {
      console.error('Folder picker dialog error:', error)
      return { filePath: null, canceled: true }
    }
  })

  /**
   * dialog:pickImage — Open the native file picker to select an image,
   * returning it encoded as a base64 data URI.
   */
  ipcMain.handle('dialog:pickImage', async () => {
    try {
      const focused = BrowserWindow.getFocusedWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Select Company Logo',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }],
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
      const ext = path.extname(selectedPath).toLowerCase().replace('.', '')
      let mimeType = 'image/png'
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
      else if (ext === 'svg') mimeType = 'image/svg+xml'

      const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`
      return { base64, canceled: false }
    } catch (error) {
      console.error('Image picker error:', error)
      return { base64: null, canceled: true }
    }
  })
}
