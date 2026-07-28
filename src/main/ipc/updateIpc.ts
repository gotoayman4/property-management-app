/**
 * @file updateIpc — IPC surface for the auto-update system + app version metadata.
 *
 * INTENT: The renderer's ONLY window into the updater. Exposes:
 *         - `app:getInfo`        → version/platform metadata for the About dialog
 *         - `updates:check`      → manual "Check for Updates"
 *         - `updates:download`   → start background download of a known update
 *         - `updates:install`    → run the verified installer and quit
 *         - `updates:getState`   → snapshot for late-mounting UI
 *         plus a push channel `updates:state` (webContents.send) for live progress.
 *
 * CONSTRAINT (AGENTS.md): no payloads are accepted from the renderer on any updates channel —
 *         all inputs are implicit (current state), so there is nothing to Zod-validate. If a
 *         future channel takes renderer data (e.g. a channel picker), it MUST validate first.
 * CONSTRAINT: the startup auto-check respects `settings.auto_update_check` and is delayed so
 *         it can never compete with DB migrations or first-paint work.
 */

import { app, ipcMain, BrowserWindow } from 'electron'
import { db } from '../db/database'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  onUpdateState,
  UPDATE_REPO,
  WEBSITE_URL
} from '../services/updateService'
import { logger } from '../utils/logger'

/** Startup delay before the automatic background check (never blocks first paint). */
const STARTUP_CHECK_DELAY_MS = 15_000
/** Minimum interval between automatic checks while the app stays open. */
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export function registerUpdateIpcHandlers(): void {
  // Forward every updater state transition to all renderer windows.
  onUpdateState((state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('updates:state', state)
    }
  })

  /**
   * app:getInfo — static metadata for the About dialog. Version comes from app.getVersion(),
   * which reads package.json — the single source of truth (docs/deployment-architecture.md §4).
   */
  ipcMain.handle('app:getInfo', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    repoUrl: `https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}`,
    websiteUrl: WEBSITE_URL
  }))

  ipcMain.handle('updates:check', async () => checkForUpdates())
  ipcMain.handle('updates:download', async () => downloadUpdate())
  ipcMain.handle('updates:install', async () => installUpdate())
  ipcMain.handle('updates:getState', async () => getUpdateState())
}

/**
 * Kick off the periodic background update check (startup + every 4h), honoring the
 * `auto_update_check` setting on every tick. Called once from main/index.ts after app ready.
 * Side effects: schedules timers; performs network checks that only mutate updater state.
 */
export function startAutoUpdateChecks(): void {
  const isEnabled = (): boolean => {
    try {
      const row = db.prepare('SELECT auto_update_check FROM settings WHERE id = 1').get() as
        { auto_update_check: number } | undefined
      return (row?.auto_update_check ?? 1) === 1
    } catch (error) {
      logger.error('Failed to read auto_update_check setting', error)
      return false
    }
  }

  const tick = (): void => {
    if (isEnabled()) {
      void checkForUpdates()
    }
  }

  setTimeout(tick, STARTUP_CHECK_DELAY_MS)
  setInterval(tick, RECHECK_INTERVAL_MS)
}
