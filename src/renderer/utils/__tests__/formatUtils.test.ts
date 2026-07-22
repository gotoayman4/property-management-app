/**
 * @file formatUtils.test — tests for locale-aware number and currency formatting.
 *
 * INTENT: Verify formatCurrency and formatNumber produce correct output in both English and
 *         Arabic locales, using Western Arabic numerals for Arabic per the Numeral Policy.
 * CONSTRAINT: formatDate returns raw string (future formatting work planned).
 */
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatNumber, formatDate } from '../formatUtils'

describe('formatCurrency', () => {
  describe('English locale', () => {
    it('formats with 2 decimal places and currency suffix', () => {
      expect(formatCurrency(1500.5, 'en', 'JOD')).toBe('1,500.50 JOD')
    })

    it('formats zero correctly', () => {
      expect(formatCurrency(0, 'en', 'USD')).toBe('0.00 USD')
    })

    it('formats negative amounts', () => {
      expect(formatCurrency(-500.25, 'en', 'JOD')).toBe('-500.25 JOD')
    })

    it('formats large numbers with grouping', () => {
      expect(formatCurrency(1234567.89, 'en', 'TRY')).toBe('1,234,567.89 TRY')
    })

    it('rounds to 2 decimal places', () => {
      expect(formatCurrency(100.999, 'en', 'JOD')).toBe('101.00 JOD')
    })

    it('falls back to English for unrecognized locale', () => {
      expect(formatCurrency(100, 'xx', 'JOD')).toBe('100.00 JOD')
    })
  })

  describe('Arabic locale', () => {
    it('uses Western Arabic numerals (ar-u-nu-latn)', () => {
      const result = formatCurrency(1500.5, 'ar', 'JOD')
      // Should contain standard digits 0-9, not Arabic-Indic numerals ٠-٩.
      expect(result).toMatch(/1,500\.50 JOD/)
    })

    it('formats zero in Arabic locale', () => {
      expect(formatCurrency(0, 'ar', 'JOD')).toBe('0.00 JOD')
    })

    it('formats negative amounts in Arabic locale', () => {
      expect(formatCurrency(-500, 'ar', 'JOD')).toBe('-500.00 JOD')
    })

    it('formats large numbers with grouping in Arabic locale', () => {
      expect(formatCurrency(1234567.89, 'ar', 'TRY')).toBe('1,234,567.89 TRY')
    })
  })
})

describe('formatNumber', () => {
  it('formats with grouping in English', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567')
  })

  it('formats with Western Arabic numerals in Arabic', () => {
    expect(formatNumber(1234567, 'ar')).toBe('1,234,567')
  })

  it('formats zero', () => {
    expect(formatNumber(0, 'en')).toBe('0')
  })

  it('formats negative numbers', () => {
    expect(formatNumber(-42, 'en')).toBe('-42')
  })

  it('falls back to English for unrecognized locale', () => {
    expect(formatNumber(1000, 'xyz')).toBe('1,000')
  })
})

describe('formatDate', () => {
  it('returns the raw date string', () => {
    expect(formatDate('2026-07-15')).toBe('2026-07-15')
  })

  it('returns em-dash for null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })

  it('returns em-dash for empty string', () => {
    expect(formatDate('')).toBe('—')
  })
})
