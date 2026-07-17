import { Database } from 'better-sqlite3'

/**
 * INTENT: Pure helpers for multi-year rent escalation (FR-CON-09..13, BR-16/17).
 * CONSTRAINT: rent_amount is the source of truth per year; increase_percent_applied is
 *             informational only. Year 1 effective_start_date must equal the contract start;
 *             each subsequent year strictly later and within ~13 months of the prior (BR-17).
 * DECISION: Kept separate from the IPC layer so the validation rules are unit-testable in
 *           isolation against an in-memory DB.
 */

export interface EscalationYearInput {
  year_number: number
  effective_start_date: string // YYYY-MM-DD
  rent_amount: number
  increase_percent_applied?: number
  notes?: string
}

export class EscalationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EscalationValidationError'
  }
}

/** Months-per-year upper bound for the BR-17 "no more than ~13 months" gap check. */
const MAX_MONTHS_BETWEEN_YEARS = 13

/**
 * Validate a multi-year schedule against BR-17 before persisting.
 * Throws EscalationValidationError on any violation.
 */
export function validateEscalationSchedule(
  contractStartDate: string,
  schedule: EscalationYearInput[]
): void {
  if (schedule.length < 2) {
    throw new EscalationValidationError('SCHEDULE_TOO_SHORT')
  }
  if (schedule.length > 20) {
    throw new EscalationValidationError('SCHEDULE_TOO_LONG')
  }

  const sorted = [...schedule].sort((a, b) => a.year_number - b.year_number)

  for (let i = 0; i < sorted.length; i++) {
    const year = sorted[i]
    const expectedYearNumber = i + 1
    if (year.year_number !== expectedYearNumber) {
      throw new EscalationValidationError('YEAR_NUMBER_GAP')
    }
    if (year.rent_amount <= 0) {
      throw new EscalationValidationError('RENT_NON_POSITIVE')
    }
    if (year.increase_percent_applied !== undefined) {
      if (year.increase_percent_applied < 0 || year.increase_percent_applied > 100) {
        throw new EscalationValidationError('PERCENT_OUT_OF_RANGE')
      }
    }

    if (i === 0) {
      // BR-17: Year 1 effective_start_date must equal the contract start date
      if (year.effective_start_date !== contractStartDate) {
        throw new EscalationValidationError('YEAR1_NOT_CONTRACT_START')
      }
    } else {
      const prev = sorted[i - 1]
      const gapMonths = monthsBetween(prev.effective_start_date, year.effective_start_date)
      if (gapMonths <= 0) {
        throw new EscalationValidationError('YEAR_ORDER_INVALID')
      }
      if (gapMonths > MAX_MONTHS_BETWEEN_YEARS) {
        throw new EscalationValidationError('YEAR_GAP_TOO_LARGE')
      }
    }
  }
}

/**
 * Auto-generate a per-year schedule from a starting rent + a sequence of yearly increase
 * percentages (FR-CON-10). Each generated year's rent_amount = prior * (1 + pct/100).
 * The caller may override individual amounts afterward.
 */
export function generateScheduleFromPercentages(
  contractStartDate: string,
  baseRent: number,
  increasePercentages: number[]
): EscalationYearInput[] {
  const schedule: EscalationYearInput[] = []
  let currentRent = baseRent
  let currentDate = new Date(contractStartDate + 'T00:00:00Z')

  increasePercentages.forEach((pct, idx) => {
    if (idx === 0) {
      // Year 1 keeps the base rent; pct is informational (often 0)
      schedule.push({
        year_number: 1,
        effective_start_date: contractStartDate,
        rent_amount: round2(baseRent),
        increase_percent_applied: pct
      })
    } else {
      currentRent = currentRent * (1 + pct / 100)
      currentDate = addYearsUTC(currentDate, 1)
      schedule.push({
        year_number: idx + 1,
        effective_start_date: toISODate(currentDate),
        rent_amount: round2(currentRent),
        increase_percent_applied: pct
      })
    }
  })

  return schedule
}

/**
 * Persist a validated schedule for a contract, replacing any prior rows. Must be called
 * inside the caller's transaction alongside the contract_history insert.
 */
export function persistSchedule(
  db: Database,
  contractId: number,
  schedule: EscalationYearInput[]
): void {
  db.prepare('DELETE FROM rent_escalation_schedule WHERE contract_id = ?').run(contractId)
  const stmt = db.prepare(`
    INSERT INTO rent_escalation_schedule
      (contract_id, year_number, effective_start_date, rent_amount, increase_percent_applied, notes)
    VALUES (@contractId, @year_number, @effective_start_date, @rent_amount, @increase_percent_applied, @notes)
  `)
  for (const row of schedule) {
    stmt.run({
      contractId,
      year_number: row.year_number,
      effective_start_date: row.effective_start_date,
      rent_amount: row.rent_amount,
      increase_percent_applied: row.increase_percent_applied ?? null,
      notes: row.notes ?? null
    })
  }
}

// --- pure date helpers (UTC to avoid local-tz drift) ---

function monthsBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO + 'T00:00:00Z')
  const end = new Date(endISO + 'T00:00:00Z')
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
  )
}

function addYearsUTC(date: Date, years: number): Date {
  const d = new Date(date.getTime())
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
