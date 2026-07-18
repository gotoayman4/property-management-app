/**
 * @file fileDialogService — wrapper around Electron's Save dialog + path resolution.
 *
 * INTENT: Provide the ONLY place where the export/backup flows ask the user where to save a file.
 *         Centralizing this keeps the trust boundary tight: the renderer cannot write to disk
 *         directly; it can only trigger a save through this service via a typed IPC handler.
 *
 * CONSTRAINT (AGENTS.md): no renderer filesystem access. All disk writes go through the main
 *             process. The native save dialog is the user's explicit consent to a write target.
 *
 * DECISION: The default directory falls back through a chain: settings.backup_path →
 *           <Documents>/<App Brand>/Exports → app.getPath('documents'). The user can still
 *           override the directory in the dialog (the "Both (default + override)" UX).
 */

import { join } from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import { db } from '../db/database'

/** The user-facing app brand, mirrored from the i18n `app.brand` key. Kept as a constant so the
 *  main process does not need to load locale JSON just to name a folder. */
const APP_BRAND = 'Property Manager'

export interface SaveDialogResult {
  /** The absolute path the user chose, or null if they cancelled. */
  filePath: string | null
  /** True if the user dismissed the dialog without choosing. */
  canceled: boolean
}

/**
 * Resolve the default export directory for save dialogs.
 * Order: configured backup_path → Documents/<App Brand>/Exports → Documents.
 * Never throws; always returns a valid path.
 */
export function resolveDefaultExportDir(): string {
  try {
    const settings = db.prepare('SELECT backup_path FROM settings WHERE id = 1').get() as
      { backup_path: string | null } | undefined

    if (settings?.backup_path && settings.backup_path.trim().length > 0) {
      return settings.backup_path.trim()
    }
  } catch {
    // DB not ready or settings row missing — fall through to default.
  }

  try {
    return join(app.getPath('documents'), APP_BRAND, 'Exports')
  } catch {
    // Last-resort fallback if getPath itself is unavailable (e.g. during tests).
    return app.getPath('documents') || process.cwd()
  }
}

/**
 * Show a native Save dialog pre-filled with `defaultFileName` in the default export directory.
 *
 * @param defaultFileName e.g. "Income_Report_2026-07-01_to_2026-07-31.xlsx"
 * @param extensions      allowed extensions without dot, e.g. ['xlsx'] or ['html']
 * @returns the chosen path (or null if cancelled). Never throws — callers handle null.
 */
export async function showSaveDialog(
  defaultFileName: string,
  extensions: string[]
): Promise<SaveDialogResult> {
  const defaultDir = resolveDefaultExportDir()
  // Prefer a focused parent window so the dialog is modal to it; fall back to the no-parent
  // overload if there is none. We pick the overload dynamically so the TS types stay satisfied
  // without an eslint-disable.
  const focused = BrowserWindow.getFocusedWindow()
  const options = {
    title: 'Save export',
    defaultPath: join(defaultDir, defaultFileName),
    filters: [
      { name: extensions[0]?.toUpperCase() ?? 'File', extensions },
      { name: 'All files', extensions: ['*'] }
    ]
  }

  const result = focused
    ? await dialog.showSaveDialog(focused, options)
    : await dialog.showSaveDialog(options)

  return {
    filePath: result.canceled ? null : (result.filePath ?? null),
    canceled: result.canceled
  }
}
