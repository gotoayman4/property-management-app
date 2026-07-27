/**
 * @file useDirection — single source of truth for RTL/LTR direction detection.
 *
 * INTENT: Replace the ~20 duplicated `const isRtl = i18n.language === 'ar'` lines scattered
 *         across components and pages. Provides a boolean that components can use for conditional
 *         rendering and a direction string for MUI props.
 *
 * CAVEAT: Returns a boolean (`true` = RTL). If you need the string `'rtl' | 'ltr'`, use
 *         `useDirectionString()` from the same module.
 */
import { useTranslation } from 'react-i18next'

/** Returns `true` when the current language is Arabic (RTL). */
export function useDirection(): boolean {
  const { i18n } = useTranslation()
  return i18n.language === 'ar'
}

/** Returns `'rtl'` or `'ltr'` for use in MUI `dir` props and similar. */
export function useDirectionString(): 'rtl' | 'ltr' {
  return useDirection() ? 'rtl' : 'ltr'
}
