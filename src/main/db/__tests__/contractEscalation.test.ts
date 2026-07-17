import { describe, it, expect } from 'vitest'
import {
  validateEscalationSchedule,
  generateScheduleFromPercentages,
  EscalationValidationError
} from '../contractEscalation'

/**
 * INTENT: Verify the multi-year escalation validation rules (BR-16/17) + schedule generation (FR-CON-10).
 * CONSTRAINT: Per AGENTS — normalization/validation functions require exhaustive parameterized tests.
 */

describe('validateEscalationSchedule (BR-17)', () => {
  const START = '2026-01-01'

  it('accepts a valid 3-year schedule', () => {
    expect(() =>
      validateEscalationSchedule(START, [
        { year_number: 1, effective_start_date: '2026-01-01', rent_amount: 1000 },
        { year_number: 2, effective_start_date: '2027-01-01', rent_amount: 1050 },
        { year_number: 3, effective_start_date: '2028-01-01', rent_amount: 1100 }
      ])
    ).not.toThrow()
  })

  it('rejects a single-year schedule (must be >= 2)', () => {
    expect(() =>
      validateEscalationSchedule(START, [
        { year_number: 1, effective_start_date: START, rent_amount: 1000 }
      ])
    ).toThrow(EscalationValidationError)
  })

  it('rejects when year 1 effective_start_date != contract start', () => {
    expect(() =>
      validateEscalationSchedule(START, [
        { year_number: 1, effective_start_date: '2026-02-01', rent_amount: 1000 },
        { year_number: 2, effective_start_date: '2027-02-01', rent_amount: 1050 }
      ])
    ).toThrow('YEAR1_NOT_CONTRACT_START')
  })

  it('rejects a gap larger than 13 months between years', () => {
    expect(() =>
      validateEscalationSchedule(START, [
        { year_number: 1, effective_start_date: '2026-01-01', rent_amount: 1000 },
        { year_number: 2, effective_start_date: '2027-03-15', rent_amount: 1050 }
      ])
    ).toThrow('YEAR_GAP_TOO_LARGE')
  })

  it('rejects non-positive rent', () => {
    expect(() =>
      validateEscalationSchedule(START, [
        { year_number: 1, effective_start_date: '2026-01-01', rent_amount: 0 },
        { year_number: 2, effective_start_date: '2027-01-01', rent_amount: 100 }
      ])
    ).toThrow('RENT_NON_POSITIVE')
  })

  it('rejects increase_percent outside 0..100', () => {
    expect(() =>
      validateEscalationSchedule(START, [
        {
          year_number: 1,
          effective_start_date: '2026-01-01',
          rent_amount: 100,
          increase_percent_applied: 150
        },
        { year_number: 2, effective_start_date: '2027-01-01', rent_amount: 110 }
      ])
    ).toThrow('PERCENT_OUT_OF_RANGE')
  })

  it('rejects a year-number gap in the sequence', () => {
    expect(() =>
      validateEscalationSchedule(START, [
        { year_number: 1, effective_start_date: '2026-01-01', rent_amount: 100 },
        { year_number: 3, effective_start_date: '2027-01-01', rent_amount: 110 }
      ])
    ).toThrow('YEAR_NUMBER_GAP')
  })
})

describe('generateScheduleFromPercentages (FR-CON-10)', () => {
  it('computes per-year rent from a base + percentage sequence', () => {
    const schedule = generateScheduleFromPercentages('2026-01-01', 1000, [0, 5, 7])
    expect(schedule).toHaveLength(3)
    expect(schedule[0].rent_amount).toBe(1000) // year 1 = base
    expect(schedule[0].effective_start_date).toBe('2026-01-01')
    expect(schedule[1].rent_amount).toBe(1050) // 1000 * 1.05
    expect(schedule[1].effective_start_date).toBe('2027-01-01')
    expect(schedule[2].rent_amount).toBe(1123.5) // 1050 * 1.07
    expect(schedule[2].effective_start_date).toBe('2028-01-01')
  })

  it('generated schedule passes validation', () => {
    const schedule = generateScheduleFromPercentages('2026-01-01', 3000, [0, 5, 7, 4])
    expect(() => validateEscalationSchedule('2026-01-01', schedule)).not.toThrow()
  })
})
