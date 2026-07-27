/**
 * @file updateService.test.ts — unit tests for the auto-update engine.
 *
 * INTENT: Exhaustively verify the pure decision logic (version compare, release→update mapping,
 *         SHA256SUMS parsing) plus the checkForUpdates state machine against a mocked
 *         GitHub Releases API. Download/install paths touch fs + child_process and are
 *         covered by the release smoke checklist instead (docs/release-process.md).
 * CONSTRAINT (AGENTS.md): normalization/mapping functions require exhaustive parameterized
 *         tests — compareVersions and parseShaSums use it.each accordingly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Electron is unavailable under Vitest — provide the two APIs updateService touches.
const netFetchMock = vi.fn()
vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => '/tmp',
    quit: vi.fn()
  },
  net: {
    fetch: (...args: unknown[]): unknown => netFetchMock(...args)
  }
}))

import {
  compareVersions,
  extractUpdateInfo,
  parseShaSums,
  checkForUpdates,
  getUpdateState
} from '../updateService'

/** Minimal valid release payload builder for extractUpdateInfo/checkForUpdates tests. */
function makeRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v1.1.0',
    name: 'PropManager 1.1.0',
    body: 'notes',
    draft: false,
    prerelease: false,
    published_at: '2026-07-01T00:00:00Z',
    assets: [
      {
        name: 'PropManager-1.1.0-setup.exe',
        size: 1000,
        browser_download_url:
          'https://github.com/x/y/releases/download/v1.1.0/PropManager-1.1.0-setup.exe'
      },
      {
        name: 'SHA256SUMS.txt',
        size: 100,
        browser_download_url: 'https://github.com/x/y/releases/download/v1.1.0/SHA256SUMS.txt'
      }
    ],
    ...overrides
  }
}

describe('compareVersions', () => {
  it.each([
    // [a, b, expected sign]
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.0.0', '1.0.1', -1],
    ['1.1.0', '1.0.9', 1],
    ['2.0.0', '1.9.9', 1],
    ['1.2.10', '1.2.9', 1], // numeric, not lexicographic
    ['v1.1.0', '1.0.0', 1], // v-prefix tolerated
    ['1.1.0', 'v1.1.0', 0],
    ['1.0.0-beta.1', '1.0.0', 0], // pre-release suffix stripped (core compare only)
    ['1.0.0+build5', '1.0.0', 0], // build metadata stripped
    ['1.0', '1.0.0', 0], // missing segments = 0
    ['1', '1.0.0', 0],
    ['', '1.0.0', -1], // empty/invalid parses to 0.0.0
    ['garbage', '0.0.0', 0],
    ['10.0.0', '9.99.99', 1]
  ])('compareVersions(%s, %s) sign is %i', (a, b, sign) => {
    const result = compareVersions(a as string, b as string)
    expect(Math.sign(result)).toBe(sign)
  })
})

describe('extractUpdateInfo', () => {
  it('maps a newer release with setup + checksum assets to UpdateInfo', () => {
    const info = extractUpdateInfo(makeRelease() as never, '1.0.0')
    expect(info).not.toBeNull()
    expect(info?.version).toBe('1.1.0')
    expect(info?.setupName).toBe('PropManager-1.1.0-setup.exe')
    expect(info?.setupSize).toBe(1000)
    expect(info?.shaSumsUrl).toContain('SHA256SUMS.txt')
  })

  it('returns null for drafts', () => {
    expect(extractUpdateInfo(makeRelease({ draft: true }) as never, '1.0.0')).toBeNull()
  })

  it('returns null for prereleases', () => {
    expect(extractUpdateInfo(makeRelease({ prerelease: true }) as never, '1.0.0')).toBeNull()
  })

  it('returns null when the release is not newer (equal + older)', () => {
    expect(extractUpdateInfo(makeRelease() as never, '1.1.0')).toBeNull()
    expect(extractUpdateInfo(makeRelease() as never, '1.2.0')).toBeNull()
  })

  it('returns null when no -setup.exe asset exists', () => {
    const release = makeRelease({
      assets: [{ name: 'source.zip', size: 5, browser_download_url: 'https://x/source.zip' }]
    })
    expect(extractUpdateInfo(release as never, '1.0.0')).toBeNull()
  })

  it('yields null shaSumsUrl when the manifest asset is missing (download will then abort)', () => {
    const release = makeRelease({
      assets: [
        {
          name: 'PropManager-1.1.0-setup.exe',
          size: 1000,
          browser_download_url: 'https://x/setup.exe'
        }
      ]
    })
    const info = extractUpdateInfo(release as never, '1.0.0')
    expect(info?.shaSumsUrl).toBeNull()
  })
})

describe('parseShaSums', () => {
  const digestA = 'a'.repeat(64)
  const digestB = 'b'.repeat(64)

  it.each([
    // [manifest, fileName, expected]
    [`${digestA}  PropManager-1.1.0-setup.exe`, 'PropManager-1.1.0-setup.exe', digestA],
    // sha256sum binary-mode marker (*) before the filename
    [`${digestA} *PropManager-1.1.0-setup.exe`, 'PropManager-1.1.0-setup.exe', digestA],
    // multiple lines — picks the matching file
    [
      `${digestB}  other.exe\n${digestA}  PropManager-1.1.0-setup.exe`,
      'PropManager-1.1.0-setup.exe',
      digestA
    ],
    // CRLF line endings
    [`${digestB}  other.exe\r\n${digestA}  setup.exe`, 'setup.exe', digestA],
    // uppercase hex normalized to lowercase
    [`${'A'.repeat(64)}  setup.exe`, 'setup.exe', digestA],
    // file not listed
    [`${digestA}  other.exe`, 'setup.exe', null],
    // malformed digest (too short) ignored
    [`abc123  setup.exe`, 'setup.exe', null],
    // empty manifest
    ['', 'setup.exe', null]
  ])('parses manifest correctly (case %#)', (manifest, fileName, expected) => {
    expect(parseShaSums(manifest as string, fileName as string)).toBe(expected)
  })
})

describe('checkForUpdates state machine', () => {
  beforeEach(() => {
    netFetchMock.mockReset()
  })

  it('transitions to update-available when a newer release exists', async () => {
    netFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeRelease()
    })
    const state = await checkForUpdates()
    expect(state.phase).toBe('update-available')
    expect(state.info?.version).toBe('1.1.0')
    expect(getUpdateState().phase).toBe('update-available')
  })

  it('transitions to up-to-date when latest release is not newer', async () => {
    netFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeRelease({ tag_name: 'v1.0.0' })
    })
    const state = await checkForUpdates()
    expect(state.phase).toBe('up-to-date')
    expect(state.info).toBeNull()
  })

  it('treats 404 (no releases yet) as up-to-date, not an error', async () => {
    netFetchMock.mockResolvedValue({ ok: false, status: 404 })
    const state = await checkForUpdates()
    expect(state.phase).toBe('up-to-date')
    expect(state.errorCode).toBeNull()
  })

  it('reports UPDATE_CHECK_FAILED on network failure without throwing', async () => {
    netFetchMock.mockRejectedValue(new Error('offline'))
    const state = await checkForUpdates()
    expect(state.phase).toBe('error')
    expect(state.errorCode).toBe('UPDATE_CHECK_FAILED')
  })

  it('reports UPDATE_CHECK_FAILED on server errors (500)', async () => {
    netFetchMock.mockResolvedValue({ ok: false, status: 500 })
    const state = await checkForUpdates()
    expect(state.phase).toBe('error')
    expect(state.errorCode).toBe('UPDATE_CHECK_FAILED')
  })
})
