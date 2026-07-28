/**
 * @file i18n helpers for the marketing site.
 *
 * INTENT: Tiny locale toolkit — no runtime i18n library needed for a static
 *         site. Arabic is the default locale at "/", English under "/en/".
 */
import { ar } from './ar'
import { en } from './en'

export type Locale = 'ar' | 'en'
/** Arabic-first: the dictionary shape is derived from ar.ts. */
export type Dictionary = typeof ar

const dictionaries: Record<Locale, Dictionary> = { ar, en }

/** Full string table for a locale. */
export function t(locale: Locale): Dictionary {
  return dictionaries[locale]
}

/** Text direction for the <html dir> attribute and logical layout. */
export function dir(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

/**
 * Locale-aware path builder: localePath('en', '/features') → '/en/features',
 * localePath('ar', '/features') → '/features'.
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return locale === 'ar' ? clean : `/en${clean === '/' ? '' : clean}`
}

/** The same page in the other locale — used by the language switcher + hreflang. */
export function alternatePath(locale: Locale, pathname: string): string {
  if (locale === 'ar') {
    return pathname === '/' ? '/en' : `/en${pathname.replace(/\/$/, '')}`
  }
  const stripped = pathname.replace(/^\/en\/?/, '/')
  return stripped === '' ? '/' : stripped
}
