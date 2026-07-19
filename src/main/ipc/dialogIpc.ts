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

import { ipcMain } from 'electron'
import { showOpenDirectoryDialog } from '../services/fileDialogService'

export function registerDialogIpcHandlers(): void {
  /**
   * dialog:pickFolder — Open the native folder picker and return the chosen directory.
   *
   * @returns { filePath: string | null; canceled: boolean } — `filePath` is the chosen absolute
   *          directory path, or null if the user cancelled. `canceled` is true when the user
   *          dismissed the dialog.
   */
  ipcMain.handle('dialog:pickFolder', async () => {
    try {
      return await showOpenDirectoryDialog()
    } catch (error) {
      console.error('Folder picker dialog error:', error)
      // Return a cancelled result rather than throwing — the renderer treats null/canceled
      // identically (no path update), and a thrown error would surface as a generic snackbar
      // which is less actionable than a silent no-op.
      return { filePath: null, canceled: true }
    }
  })
}
