/**
 * @file formatUtils — shared number/currency/date format helpers for the renderer.
 *
 * INTENT: Every monetary display in the app routes through these helpers, guaranteeing
 *         consistent locale-aware formatting. Raw `.toLocaleString()` without an explicit
 *         locale argument is forbidden by NFR-I18N-07; these helpers enforce that.
 *
 * DECISION: `ar` locale maps to `ar-u-nu-latn` so Arabic UI uses Western Arabic numerals
 *           (0 1 2 3...) per the Numeral Policy in AGENTS.md. English uses bare `en`.
 *           Currency codes are appended as a separate run of text so they never get
 *           converted by the number formatter.
 */
const LOCALE_MAP: Record<string, string> = {
  ar: 'ar-u-nu-latn',
  en: 'en'
}

/**
 * Format a monetary amount with the user's current locale.
 * Example: formatCurrency(1500.5, 'ar', 'JOD') → "١٬٥٠٠٫٥٠ JOD"
 *          formatCurrency(1500.5, 'en', 'JOD') → "1,500.50 JOD"
 */
export function formatCurrency(amount: number, language: string, currency: string): string {
  const locale = LOCALE_MAP[language] || 'en'
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
  // Strip Unicode directional isolates/marks (U+200E LTR, U+200F RTL, U+2066-U+2069)
  // that Intl.NumberFormat inserts for negative numbers in RTL locales.
  const cleaned = formatted.replace(/[\u200E\u200F\u2066\u2067\u2068\u2069]/g, '')
  return `${cleaned} ${currency}`
}

/**
 * Format a plain number (non-currency) with locale-aware grouping.
 * Example: formatNumber(1500, 'ar') → "١٬٥٠٠"
 */
export function formatNumber(amount: number, language: string): string {
  const locale = LOCALE_MAP[language] || 'en'
  return new Intl.NumberFormat(locale).format(amount)
}

/**
 * Format a date string (YYYY-MM-DD) for display. Returns the raw string unchanged
 * for now — date formatting is less controversial than currency, and most UIs already
 * show the YYYY-MM-DD string legibly. This hook exists as a target for future
 * Gregorian/Hijri/format preference work (FR-SET-06).
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return dateStr
}
