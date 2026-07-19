/**
 * INTENT: Resolve a country code to its localized display name using the
 *         bilingual worldCountries data (EN/AR), with fallback to DB name or
 *         the raw code. Used wherever country names appear in the UI.
 * CONSTRAINT (AGENTS.md): all UI strings use i18n keys; this utility is the
 *         exception because country names come from a data file, not from
 *         translation JSON.
 */
import { worldCountries } from '../data/worldCountries'

/**
 * Return the best available localized name for a country code.
 * Priority: worldCountries localized name → fallbackName → code.
 */
export function getLocalizedCountryName(
  code: string,
  language: string,
  fallbackName?: string
): string {
  const entry = worldCountries.find((c) => c.code === code)
  if (entry) {
    return language === 'ar' ? entry.nameAr : entry.name
  }
  return fallbackName || code
}
