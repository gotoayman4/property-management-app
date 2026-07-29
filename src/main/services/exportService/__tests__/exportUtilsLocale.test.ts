/**
 * @file exportUtilsLocale.test — regression tests for packaged-app locale resolution.
 *
 * INTENT: Guard the REPORT_BUILD_FAILED production bug: exportUtils previously read
 *         `src/renderer/locales/*.json` from disk relative to app.getAppPath()/cwd at runtime.
 *         Inside the packaged asar `src/**` does not exist, so every resolveLocaleKey call
 *         threw ENOENT and every locale-resolving report failed with REPORT_BUILD_FAILED.
 *         The fix inlines both locale files via static imports; resolution must therefore
 *         work even when the process cwd has no project files at all.
 */
import { tmpdir } from 'os'
import { describe, it, expect } from 'vitest'
import { resolveLocaleKey, tryResolveLocaleKey } from '../exportUtils'

describe('exportUtils locale resolution (packaged-app regression)', () => {
  it('resolves keys in both languages with no project files reachable from cwd', () => {
    const originalCwd = process.cwd()
    // Simulate the packaged app: cwd points somewhere without src/renderer/locales.
    process.chdir(tmpdir())
    try {
      expect(resolveLocaleKey('reports.type.income', 'en')).toBe('Income Report')
      expect(resolveLocaleKey('reports.type.income', 'ar')).not.toMatch(/^reports\./)
      expect(resolveLocaleKey('reports.type.dues_schedule', 'en')).toBeTruthy()
      expect(resolveLocaleKey('reports.type.document_expiry', 'ar')).toBeTruthy()
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('still throws a stable code for missing keys (BR-29 — no silent fallback)', () => {
    expect(() => resolveLocaleKey('reports.definitely.missing', 'en')).toThrow(/I18N_KEY_MISSING/)
  })

  it('interpolates {{param}} placeholders', () => {
    const text = resolveLocaleKey('reports.percentIncrease', 'en', { percent: 5 })
    expect(text).toContain('5')
  })

  it('tryResolveLocaleKey falls back to the last key segment instead of throwing', () => {
    expect(tryResolveLocaleKey('expense.category.my_custom', 'en')).toBe('my_custom')
  })
})
