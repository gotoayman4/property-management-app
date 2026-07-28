/**
 * @file updateService — auto-update engine: GitHub Releases check, download, verify, install.
 *
 * INTENT: Full update lifecycle for the Inno Setup distribution channel:
 *         1. check   — GET /repos/{owner}/{repo}/releases/latest, semver-compare with app version
 *         2. download — stream the `-setup.exe` asset to a temp dir with progress callbacks
 *         3. verify  — SHA-256 of the download MUST match SHA256SUMS.txt from the same release
 *         4. install — run `setup.exe /SILENT /NORESTART` detached, then quit the app
 *
 * CONSTRAINT (ADR-003 §4): electron-updater is NOT used — it cannot service Inno Setup installs.
 *         This service + GitHub Releases is the sanctioned replacement.
 * CONSTRAINT (ADR-001 precedent): network access uses Electron `net.fetch` ONLY, main process
 *         ONLY, HTTPS to api.github.com / github.com / objects.githubusercontent.com ONLY.
 *         An update check must NEVER block startup and must fail silently to "no update".
 * CONSTRAINT: a failed download or hash mismatch leaves the installed version untouched —
 *         the installer is only launched after verification passes (integrity gate).
 *
 * DECISION: versions are compared numerically on the dot-separated core (1.2.10 > 1.2.9);
 *         a release is an update only if strictly greater than `app.getVersion()`, which
 *         reads package.json — the single source of truth for the version number.
 *
 * CAVEAT: user data is never touched by updates — the SQLite DB and documents live under
 *         %APPDATA%/PropManager, while the installer only replaces {app} program files.
 */

import { spawn } from 'child_process'
import { createHash } from 'crypto'
import * as fs from 'fs'
import { join } from 'path'
import { app, net } from 'electron'
import { logger } from '../utils/logger'

/** GitHub repository that hosts release assets. One place to change if the repo moves. */
export const UPDATE_REPO = { owner: 'gotoayman4', repo: 'property-management-app' }

/** Public marketing/download website (Netlify) — shown in Settings › About. */
export const WEBSITE_URL = 'https://property-manager-app.netlify.app'

const RELEASES_LATEST_URL = `https://api.github.com/repos/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases/latest`

/** Minimal shape of the GitHub Releases API response consumed by this service. */
interface GithubReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}
interface GithubRelease {
  tag_name: string
  name: string
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: GithubReleaseAsset[]
}

export interface UpdateInfo {
  version: string
  releaseName: string
  releaseNotes: string
  publishedAt: string
  setupUrl: string
  setupName: string
  setupSize: number
  shaSumsUrl: string | null
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'up-to-date'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error'

export interface UpdateState {
  phase: UpdatePhase
  info: UpdateInfo | null
  /** 0..100 while downloading */
  progress: number
  /** machine-readable code for the renderer to localize (UPDATE_CHECK_FAILED, …) */
  errorCode: string | null
  downloadedPath: string | null
}

/**
 * Compare two dotted version strings numerically (pre-release/build suffixes stripped).
 * @returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Map a GitHub release JSON payload to UpdateInfo, or null when the release is not an
 * applicable Windows update (draft, prerelease, no setup.exe asset, or not newer).
 * Exported separately from the network path so it is exhaustively unit-testable.
 */
export function extractUpdateInfo(
  release: GithubRelease,
  currentVersion: string
): UpdateInfo | null {
  if (release.draft || release.prerelease) return null
  const version = release.tag_name.replace(/^v/i, '')
  if (compareVersions(version, currentVersion) <= 0) return null

  const setup = release.assets.find((a) => /-setup\.exe$/i.test(a.name))
  if (!setup) return null
  const shaSums = release.assets.find((a) => a.name.toUpperCase() === 'SHA256SUMS.TXT')

  return {
    version,
    releaseName: release.name || release.tag_name,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
    setupUrl: setup.browser_download_url,
    setupName: setup.name,
    setupSize: setup.size,
    shaSumsUrl: shaSums?.browser_download_url ?? null
  }
}

/**
 * Parse a `sha256sum`-format manifest ("<hex>  <filename>" per line) and return the
 * lowercase hex digest recorded for `fileName`, or null when absent.
 */
export function parseShaSums(manifest: string, fileName: string): string | null {
  for (const line of manifest.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (match && match[2].trim() === fileName) return match[1].toLowerCase()
  }
  return null
}

/** Module-level updater state; pushed to the renderer on every transition. */
let state: UpdateState = {
  phase: 'idle',
  info: null,
  progress: 0,
  errorCode: null,
  downloadedPath: null
}

type StateListener = (state: UpdateState) => void
const listeners = new Set<StateListener>()

/** Subscribe to state transitions (used by updateIpc to forward events to the renderer). */
export function onUpdateState(listener: StateListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getUpdateState(): UpdateState {
  return state
}

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener(state)
}

/**
 * Check GitHub for a newer release. Resolves to the new state; never throws.
 * Side effects: state transitions idle→checking→(update-available | up-to-date | error).
 */
export async function checkForUpdates(): Promise<UpdateState> {
  // A download in flight must not be clobbered by a background re-check.
  if (state.phase === 'downloading' || state.phase === 'verifying' || state.phase === 'ready') {
    return state
  }
  setState({ phase: 'checking', errorCode: null })
  try {
    const response = await net.fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    if (!response.ok) {
      // 404 = no releases yet (or private repo) — treat as "up to date", not an error.
      if (response.status === 404) {
        setState({ phase: 'up-to-date', info: null })
        return state
      }
      throw new Error(`HTTP_${response.status}`)
    }
    const release = (await response.json()) as GithubRelease
    const info = extractUpdateInfo(release, app.getVersion())
    if (info) {
      setState({ phase: 'update-available', info })
    } else {
      setState({ phase: 'up-to-date', info: null })
    }
  } catch (error) {
    logger.error('Update check failed', error)
    setState({ phase: 'error', errorCode: 'UPDATE_CHECK_FAILED' })
  }
  return state
}

/**
 * Download the installer for the currently known update and verify its SHA-256 against
 * the release's SHA256SUMS.txt. Resolves to the new state; never throws.
 * Side effects: writes to <temp>/propmanager-updates; state → downloading→verifying→ready.
 */
export async function downloadUpdate(): Promise<UpdateState> {
  const info = state.info
  if (!info || (state.phase !== 'update-available' && state.phase !== 'error')) return state

  const downloadDir = join(app.getPath('temp'), 'propmanager-updates')
  const targetPath = join(downloadDir, info.setupName)
  setState({ phase: 'downloading', progress: 0, errorCode: null })
  try {
    fs.mkdirSync(downloadDir, { recursive: true })

    const response = await net.fetch(info.setupUrl)
    if (!response.ok || !response.body) throw new Error(`HTTP_${response.status}`)

    const hash = createHash('sha256')
    const fileStream = fs.createWriteStream(targetPath)
    const reader = response.body.getReader()
    let received = 0
    // Stream chunks to disk + hash incrementally — the installer (~100 MB) must never be
    // buffered whole in memory.
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      received += value.byteLength
      await new Promise<void>((resolve, reject) => {
        fileStream.write(value, (err) => (err ? reject(err) : resolve()))
      })
      const progress = info.setupSize > 0 ? Math.round((received / info.setupSize) * 100) : 0
      if (progress !== state.progress) setState({ progress })
    }
    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })

    // Integrity gate — a release without a manifest, or a digest mismatch, aborts the update.
    setState({ phase: 'verifying', progress: 100 })
    if (!info.shaSumsUrl) throw new Error('UPDATE_NO_CHECKSUM')
    const shaResponse = await net.fetch(info.shaSumsUrl)
    if (!shaResponse.ok) throw new Error('UPDATE_NO_CHECKSUM')
    const expected = parseShaSums(await shaResponse.text(), info.setupName)
    const actual = hash.digest('hex')
    if (!expected || expected !== actual) {
      fs.rmSync(targetPath, { force: true })
      throw new Error('UPDATE_CHECKSUM_MISMATCH')
    }

    setState({ phase: 'ready', downloadedPath: targetPath })
  } catch (error) {
    logger.error('Update download failed', error)
    fs.rmSync(targetPath, { force: true })
    const code =
      error instanceof Error &&
      (error.message === 'UPDATE_CHECKSUM_MISMATCH' || error.message === 'UPDATE_NO_CHECKSUM')
        ? error.message
        : 'UPDATE_DOWNLOAD_FAILED'
    setState({ phase: 'error', errorCode: code, downloadedPath: null })
  }
  return state
}

/**
 * Launch the verified installer silently and quit. Inno Setup's CloseApplications directive
 * plus the same AppId performs an in-place upgrade; the app's `before-quit` hook still runs,
 * so the automatic database backup happens before the binary swap.
 * @returns false when there is no verified installer to run.
 */
export function installUpdate(): boolean {
  if (state.phase !== 'ready' || !state.downloadedPath) return false
  try {
    const child = spawn(
      state.downloadedPath,
      ['/SILENT', '/NORESTART', '/SUPPRESSMSGBOXES', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS'],
      { detached: true, stdio: 'ignore' }
    )
    child.unref()
    // Give the detached installer a moment to spawn before the quit sequence begins.
    setTimeout(() => app.quit(), 500)
    return true
  } catch (error) {
    logger.error('Update install launch failed', error)
    setState({ phase: 'error', errorCode: 'UPDATE_INSTALL_FAILED' })
    return false
  }
}
