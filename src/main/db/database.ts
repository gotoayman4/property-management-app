import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { runMigrations } from './migrations'
import { resolveNativeBinding } from './resolveNativeBinding'

const isDev = !app.isPackaged

/**
 * INTENT: Canonical absolute path to the SQLite database file.
 * DECISION: Exported (rather than re-resolved via `PRAGMA database_list`) because the only
 *           reliable way to read the file path is to remember where we opened it. The pragma
 *           approach (`db.pragma('database_list', { simple: true })`) returns only the first
 *           column (`seq`), not the path — see regression test in backupService.test.ts.
 *           Every caller (backupService, backupIpc) consumes this constant.
 */
export const dbPath: string = isDev
  ? join(app.getAppPath(), 'database.db')
  : (() => {
      const userDataPath = app.getPath('userData')
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true })
      }
      return join(userDataPath, 'database.db')
    })()

/**
 * INTENT: In dev, point better-sqlite3 at the prebuilt ABI-148 binary downloaded by
 *         `prebuild-install` so the running Electron app never opens
 *         `node_modules/better-sqlite3/build/Release/better_sqlite3.node`. That frees the
 *         `build/Release/` path for `npm rebuild better-sqlite3` (run by `npm test`), which
 *         previously failed with EPERM because the dev app held a lock on it.
 * CONSTRAINT: Dev-only — production is packaged with `electron-rebuild` (see `npm run build`),
 *             so the bundled `build/Release/` binary is correct and we MUST NOT override it.
 * CAVEAT: Falls back to better-sqlite3's default `bindings` resolution if the prebuilt is
 *         missing (e.g. `npm install --ignore-scripts`). A warning is logged so the user knows
 *         the lock-conflict workaround is inactive and the file may need rebuilding manually.
 */
const nativeBinding = isDev ? resolveNativeBinding(app.getAppPath()) : null
if (isDev && !nativeBinding) {
  console.warn(
    '[database] better-sqlite3 prebuilt binary not found — falling back to default resolution. ' +
      'Run `npm install` to restore it, or expect EPERM when running tests while dev is open.'
  )
}

// Open SQLite database connection
export const db = new Database(dbPath, {
  verbose: isDev ? console.warn : undefined,
  ...(nativeBinding ? { nativeBinding } : {})
})

// Enable WAL journal mode for performance and Foreign Key constraints for integrity
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initDatabase(): void {
  if (isDev) console.warn(`Database connected at: ${dbPath}`)
  runMigrations(db)
}
