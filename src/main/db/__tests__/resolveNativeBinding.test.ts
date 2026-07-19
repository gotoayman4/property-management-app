/**
 * @file resolveNativeBinding.test.ts — unit tests for the prebuilt-binary resolver.
 *
 * INTENT: Pin the contract of `resolveNativeBinding` and `prebuiltDirName` so a future edit
 *         can't silently break the dev-runtime lock-conflict workaround.
 * CONSTRAINT: Tests must not depend on the actual prebuilt existing on disk (CI / fresh clones
 *             may not have it). Inject fake `proc` values and use real `process.cwd()` for the
 *             app-root argument; assert on path shape, not file existence.
 */

import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { resolveNativeBinding, prebuiltDirName } from '../resolveNativeBinding'

describe('prebuiltDirName', () => {
  it('formats the directory name as <platform>-<arch>-<abi>', () => {
    const fakeProc = {
      platform: 'linux' as NodeJS.Platform,
      arch: 'arm64' as NodeJS.Architecture,
      versions: { modules: 148 }
    }
    expect(prebuiltDirName(fakeProc)).toBe('linux-arm64-148')
  })

  it('matches the real process triple for the current runtime', () => {
    const expected = `${process.platform}-${process.arch}-${process.versions.modules}`
    expect(prebuiltDirName()).toBe(expected)
  })

  it('accepts a string ABI (process.versions.modules is typed as string at runtime)', () => {
    const fakeProc = {
      platform: 'win32' as NodeJS.Platform,
      arch: 'x64' as NodeJS.Architecture,
      versions: { modules: '127' }
    }
    expect(prebuiltDirName(fakeProc)).toBe('win32-x64-127')
  })
})

describe('resolveNativeBinding', () => {
  it('returns null when the prebuilt file does not exist (graceful fallback)', () => {
    // Use a fake proc with an absurd ABI that will never match a real prebuilt directory.
    const fakeProc = {
      platform: 'win32' as NodeJS.Platform,
      arch: 'x64' as NodeJS.Architecture,
      versions: { modules: 999999 }
    }
    const result = resolveNativeBinding(process.cwd(), fakeProc)
    expect(result).toBeNull()
  })

  it('computes the candidate path under node_modules/better-sqlite3/bin/', () => {
    // Use the real process triple — if the prebuilt exists this returns its path; if not, null.
    // Either way the function must not throw, and the shape (when non-null) is fixed.
    const result = resolveNativeBinding(process.cwd())
    if (result !== null) {
      const expectedSuffix = join(
        'node_modules',
        'better-sqlite3',
        'bin',
        prebuiltDirName(),
        'better-sqlite3.node'
      )
      expect(result.endsWith(expectedSuffix)).toBe(true)
    }
  })

  it('never throws — returns null on any appRoot miss', () => {
    expect(() => resolveNativeBinding('/nonexistent/path/that/does/not/exist')).not.toThrow()
    expect(resolveNativeBinding('/nonexistent/path/that/does/not/exist')).toBeNull()
  })
})
