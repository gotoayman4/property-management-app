/**
 * @file resolveNativeBinding — locate better-sqlite3's prebuilt native binary for the current runtime.
 *
 * INTENT: Return the absolute path to the prebuilt `.node` file that `prebuild-install` downloads
 *         into `node_modules/better-sqlite3/bin/<platform>-<arch>-<abi>/better-sqlite3.node`.
 *         The dev Electron app loads this file via better-sqlite3's `nativeBinding` option so it
 *         never touches `build/Release/better_sqlite3.node` — leaving that path free for the Node
 *         rebuild that `npm test` performs.
 *
 * BACKGROUND (why this exists):
 *   Electron 43 and Node 22 use different module ABIs (148 vs 127). Both `electron-rebuild`
 *   (dev) and `npm rebuild better-sqlite3` (tests) write to the SAME path
 *   (`node_modules/better-sqlite3/build/Release/better_sqlite3.node`). When the dev app is
 *   running it locks that file; the test rebuild then fails with EPERM. By pointing Electron
 *   at the prebuilt binary in `bin/`, the two runtimes never share a file.
 *
 * CONSTRAINT:
 *   - MUST be runtime-agnostic. Inside Electron, `process.versions.modules` reports Electron's
 *     ABI (148 for Electron 43); inside plain Node, it reports Node's ABI (127 for Node 22).
 *     The prebuilt directory name encodes the runtime ABI, so the same code resolves correctly
 *     in either environment.
 *   - MUST NOT throw if the prebuilt is missing. Callers rely on a `null` return to fall back
 *     to better-sqlite3's default `bindings` resolution.
 *
 * CAVEAT: The prebuilt is downloaded by better-sqlite3's `install` script (`prebuild-install`).
 *         If `npm install` was run with `--ignore-scripts`, or the download silently failed,
 *         the file won't exist and this function returns `null`. The caller logs a warning and
 *         falls back — same behavior as before this resolver existed.
 */

import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Compute the directory name prebuild-install uses for the current runtime.
 * Format: `<process.platform>-<process.arch>-<process.versions.modules>`
 * (e.g. `win32-x64-148` for Electron 43 on Windows x64, `win32-x64-127` for Node 22).
 *
 * INTENT: Exposed separately so tests can verify the name format without touching the filesystem.
 *
 * @param proc - injected for testability; defaults to the real `process`
 * @returns the prebuilt directory name
 */
export function prebuiltDirName(
  proc: Pick<NodeJS.Process, 'platform' | 'arch'> & {
    versions: { modules: string | number }
  } = process
): string {
  return `${proc.platform}-${proc.arch}-${proc.versions.modules}`
}

/**
 * Resolve the absolute path to better-sqlite3's prebuilt `.node` file for the current runtime.
 *
 * @param appRoot - absolute path to the project root (where `node_modules/` lives). In Electron
 *                  dev this is `app.getAppPath()`; in tests it's typically `process.cwd()`.
 * @param proc - injected for testability; defaults to the real `process`
 * @returns absolute path if the prebuilt exists, otherwise `null`
 */
export function resolveNativeBinding(
  appRoot: string,
  proc: Pick<NodeJS.Process, 'platform' | 'arch'> & {
    versions: { modules: string | number }
  } = process
): string | null {
  const candidate = join(
    appRoot,
    'node_modules',
    'better-sqlite3',
    'bin',
    prebuiltDirName(proc),
    'better-sqlite3.node'
  )
  return existsSync(candidate) ? candidate : null
}
