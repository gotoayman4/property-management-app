/**
 * @file contractDates — Shared date/rounding helpers for the contract create & renewal forms.
 * INTENT: Dedupe the term-length and rounding math previously copied in ContractForm and
 *         ContractRenewalForm (AGENTS dedup rule). UTC-based so a YYYY-MM-DD string maps to the
 *         same calendar day regardless of the user's timezone.
 */

/** Add N calendar years to a YYYY-MM-DD date, preserving month/day (UTC). */
export function addYears(iso: string, years: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().split('T')[0]
}

/** Convenience: add a single year (the common escalation step). */
export function addYear(iso: string): string {
  return addYears(iso, 1)
}

/** Round to 2 decimal places (money). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
