/**
 * @file recurringSchedule — pure date math + status helpers for recurring expense templates.
 *
 * INTENT: Extracted from recurringExpenseIpc so the schedule logic is unit-testable in
 *         isolation (no DB, no Electron). Mirrors the contractEscalation.ts pattern.
 *
 * CONSTRAINT (FR-REC-02): supported frequencies are daily, weekly, monthly, quarterly,
 *             semi_annual, annual. 'semi-annual' is accepted as a legacy alias of
 *             'semi_annual' (older rows / SRS wording) and normalized.
 * CONSTRAINT (BR-25): a template whose end_date has passed is "ended" — the function
 *             surfaces this so callers can flip is_active to 0 and stop scheduling.
 * DECISION: All date math is LOCAL (no toISOString UTC drift); see toLocalISODate.
 */

export type RecurringFrequency =
  'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'

export interface RecurringScheduleInputs {
  frequency: string
  day_of_month: number
  start_date: string
  end_date: string | null
}

export interface RecurringScheduleTemplate extends RecurringScheduleInputs {
  id: number
  is_active: number
  last_generated_date: string | null
}

/** Format a Date as YYYY-MM-DD using LOCAL calendar fields (avoids UTC day-roll drift). */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Normalize legacy 'semi-annual' to the canonical 'semi_annual' enum value. */
export function normalizeFrequency(frequency: string): string {
  return frequency === 'semi-annual' ? 'semi_annual' : frequency
}

/**
 * INTENT: Compute the next due date strictly AFTER `afterDate` for a template.
 * RETURNS: The YYYY-MM-DD of the next occurrence, or null when the next occurrence
 *          would exceed end_date (BR-25 stop signal) or the frequency is unrecognized.
 *
 * For `daily` and `weekly`, day_of_month is ignored (a daily template fires every day;
 * a weekly template fires every 7 days from its anchor).
 */
export function getNextDueDate(
  template: RecurringScheduleInputs,
  afterDate: string
): string | null {
  const start = new Date(template.start_date + 'T00:00:00')
  const end = template.end_date ? new Date(template.end_date + 'T00:00:00') : null
  const after = new Date(afterDate + 'T00:00:00')

  // If the schedule has not started yet, the first due is the start date itself.
  if (start > after) {
    return template.start_date
  }

  const base = new Date(Math.max(start.getTime(), after.getTime()))
  const frequency = normalizeFrequency(template.frequency)
  const day = template.day_of_month
  let next: Date

  switch (frequency) {
    case 'daily':
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
      break
    case 'weekly':
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7)
      break
    case 'monthly':
      next = new Date(base.getFullYear(), base.getMonth() + 1, day)
      break
    case 'quarterly':
      next = new Date(base.getFullYear(), base.getMonth() + 3, day)
      break
    case 'semi_annual':
      next = new Date(base.getFullYear(), base.getMonth() + 6, day)
      break
    case 'annual':
      next = new Date(base.getFullYear() + 1, base.getMonth(), day)
      break
    default:
      return null
  }

  const nextStr = toLocalISODate(next)
  if (end && nextStr > toLocalISODate(end)) return null
  return nextStr
}

/**
 * INTENT: Decide whether a template should be auto-ended (BR-25).
 * RETURNS: true when the template has an end_date and that date is strictly in the past.
 */
export function shouldMarkEnded(template: RecurringScheduleInputs, today: string): boolean {
  if (!template.end_date) return false
  return template.end_date < today
}
