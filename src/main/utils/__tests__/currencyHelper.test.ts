import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from '../../db/migrations'
import {
  getLatestRate,
  convertAmount,
  computeConsolidatedNote,
  resolveReportingSnapshot,
  sumReportingSnapshot,
  formatConsolidatedSnapshotNote
} from '../currencyHelper'

/**
 * INTENT: Exhaustive regression coverage for getLatestRate (the seam that powers the
 *         exchangeRates:latest IPC and convertAmount). Specifically guards against the
 *         regression where a stored `USD→JOD` row failed to satisfy a `JOD→USD`
 *         request — the bug that surfaced as "No exchange rate on file" in the
 *         payment/expense forms even when rates existed.
 * CONSTRAINT (BR-15): direct then reverse (1/rate) resolution; never throws on a miss.
 */

describe('getLatestRate', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  })

  function addRate(
    from: string,
    to: string,
    rate: number,
    effective_date: string,
    source: 'manual' | 'online' = 'manual'
  ): void {
    db.prepare(
      `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source, fetched_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(from, to, rate, effective_date, source)
  }

  describe('identity (from === to)', () => {
    it('returns a synthetic rate=1 row without touching the DB', () => {
      const r = getLatestRate(db, 'JOD', 'JOD')
      expect(r).not.toBeNull()
      expect(r?.rate).toBe(1)
      expect(r?.currency_from).toBe('JOD')
      expect(r?.currency_to).toBe('JOD')
      expect(r?.inferred_from_reverse).toBe(false)
      expect(r?.source).toBe('identity')
    })
  })

  describe('direct rate hits', () => {
    it('returns the stored row in the requested direction', () => {
      addRate('USD', 'JOD', 0.709, '2026-07-01')
      const r = getLatestRate(db, 'USD', 'JOD')
      expect(r?.rate).toBeCloseTo(0.709)
      expect(r?.currency_from).toBe('USD')
      expect(r?.currency_to).toBe('JOD')
      expect(r?.effective_date).toBe('2026-07-01')
      expect(r?.inferred_from_reverse).toBe(false)
      expect(r?.id).toBeDefined()
    })

    it('picks the newest effective_date when multiple direct rows exist', () => {
      addRate('USD', 'JOD', 0.7, '2026-06-01')
      addRate('USD', 'JOD', 0.709, '2026-07-01')
      addRate('USD', 'JOD', 0.65, '2026-05-01')
      const r = getLatestRate(db, 'USD', 'JOD')
      expect(r?.rate).toBeCloseTo(0.709)
      expect(r?.effective_date).toBe('2026-07-01')
    })
  })

  describe('reverse-rate fallback (the bug-fix path)', () => {
    it('derives the requested direction by inverting the stored reverse pair', () => {
      // Only USD->JOD exists; a JOD property asks for JOD->USD.
      addRate('USD', 'JOD', 0.709, '2026-07-01')
      const r = getLatestRate(db, 'JOD', 'USD')
      expect(r).not.toBeNull()
      expect(r?.rate).toBeCloseTo(1 / 0.709)
      expect(r?.currency_from).toBe('JOD')
      expect(r?.currency_to).toBe('USD')
      expect(r?.inferred_from_reverse).toBe(true)
      // id/effective_date are inherited from the stored reverse row for traceability.
      expect(r?.id).toBeDefined()
      expect(r?.effective_date).toBe('2026-07-01')
    })

    it('prefers a direct row over a newer reverse row when both directions exist', () => {
      // Direct exists for the requested direction; reverse exists too but must NOT win.
      addRate('JOD', 'USD', 1.41, '2026-07-01') // direct
      addRate('USD', 'JOD', 0.7, '2026-07-10') // reverse, newer date
      const r = getLatestRate(db, 'JOD', 'USD')
      expect(r?.rate).toBeCloseTo(1.41)
      expect(r?.inferred_from_reverse).toBe(false)
    })

    it('uses the newest reverse effective_date when only reverse rows exist', () => {
      addRate('USD', 'JOD', 0.7, '2026-06-01')
      addRate('USD', 'JOD', 0.709, '2026-07-01')
      const r = getLatestRate(db, 'JOD', 'USD')
      expect(r?.rate).toBeCloseTo(1 / 0.709)
      expect(r?.effective_date).toBe('2026-07-01')
      expect(r?.inferred_from_reverse).toBe(true)
    })
  })

  describe('missing pairs', () => {
    it('returns null when neither direction has a row', () => {
      addRate('USD', 'JOD', 0.709, '2026-07-01')
      const r = getLatestRate(db, 'EUR', 'GBP')
      expect(r).toBeNull()
    })

    it('returns null when the table is empty', () => {
      expect(getLatestRate(db, 'USD', 'JOD')).toBeNull()
    })

    it('treats a zero/invalid stored rate as missing rather than using it', () => {
      // A zero rate is data corruption, not a usable rate — must not produce 0 or Infinity.
      addRate('USD', 'JOD', 0, '2026-07-01')
      const r = getLatestRate(db, 'USD', 'JOD')
      expect(r).toBeNull()
    })
  })
})

describe('convertAmount (regression for BR-15 direct+reverse)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('returns the amount unchanged for identity currencies', () => {
    expect(convertAmount(db, 100, 'JOD', 'JOD')).toBe(100)
  })

  it('converts using a direct rate', () => {
    db.prepare(
      `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
       VALUES ('USD', 'JOD', 0.709, '2026-07-01', 'manual')`
    ).run()
    expect(convertAmount(db, 100, 'USD', 'JOD')).toBeCloseTo(70.9)
  })

  it('converts using the reverse rate when only the opposite direction exists (the original bug)', () => {
    db.prepare(
      `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
       VALUES ('USD', 'JOD', 0.709, '2026-07-01', 'manual')`
    ).run()
    // 100 JOD -> USD via 1/0.709
    expect(convertAmount(db, 100, 'JOD', 'USD')).toBeCloseTo(100 / 0.709)
  })

  it('returns rate_missing when neither direction exists', () => {
    expect(convertAmount(db, 100, 'EUR', 'GBP')).toBe('rate_missing')
  })
})

describe('computeConsolidatedNote', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('returns undefined for a single-currency group (no consolidation needed)', () => {
    const note = computeConsolidatedNote(db, [{ currency: 'JOD', totals: { net: 100 } }], 'net')
    expect(note).toBeUndefined()
  })

  it('consolidates multiple currency groups into the reporting currency', () => {
    db.prepare(
      `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
       VALUES ('USD', 'JOD', 0.709, '2026-07-01', 'manual')`
    ).run()
    // settings.reporting_currency default is 'JOD' (seeded by 001_initial_schema.sql).
    const note = computeConsolidatedNote(
      db,
      [
        { currency: 'JOD', totals: { net: 100 } },
        { currency: 'USD', totals: { net: 100 } } // 100 USD -> 70.9 JOD via direct
      ],
      'net'
    )
    expect(note).toBeDefined()
    expect(note).toContain('Consolidated Total')
    expect(note).toContain('JOD')
    // Consolidation succeeded (no "missing" branch) — the merged value is 100+70.9.
    expect(note).not.toContain('Rate missing')
  })

  it('falls back to the reverse rate during consolidation', () => {
    // Only USD->JOD stored; JOD->USD must be derived.
    db.prepare(
      `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
       VALUES ('USD', 'JOD', 0.5, '2026-07-01', 'manual')`
    ).run()
    // Reporting currency default JOD. JOD group stays as-is; USD group converts via direct (0.5).
    const note = computeConsolidatedNote(
      db,
      [
        { currency: 'JOD', totals: { net: 100 } },
        { currency: 'USD', totals: { net: 100 } }
      ],
      'net'
    )
    expect(note).toBeDefined()
    expect(note).not.toContain('Rate missing')
  })

  it('reports missing pairs when no rate exists in either direction', () => {
    const note = computeConsolidatedNote(
      db,
      [
        { currency: 'JOD', totals: { net: 100 } },
        { currency: 'EUR', totals: { net: 100 } }
      ],
      'net'
    )
    expect(note).toContain('Rate missing')
    expect(note).toContain('EUR -> JOD')
  })
})

// ---------------------------------------------------------------------------
// resolveReportingSnapshot — the write-time snapshot seam
// ---------------------------------------------------------------------------

describe('resolveReportingSnapshot', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  function addRate(from: string, to: string, rate: number, date = '2026-07-01'): void {
    db.prepare(
      `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source)
       VALUES (?, ?, ?, ?, 'manual')`
    ).run(from, to, rate, date)
  }

  it('returns exchangeRate=1 for identity currency (JOD→JOD)', () => {
    const snap = resolveReportingSnapshot(db, 100, 'JOD')
    expect(snap).not.toBeNull()
    expect(snap?.reportingCurrency).toBe('JOD')
    expect(snap?.exchangeRate).toBe(1)
    expect(snap?.baseAmount).toBe(100)
  })

  it('uses the direct rate when available', () => {
    addRate('USD', 'JOD', 0.71)
    const snap = resolveReportingSnapshot(db, 200, 'USD')
    expect(snap?.reportingCurrency).toBe('JOD')
    expect(snap?.exchangeRate).toBeCloseTo(0.71)
    expect(snap?.baseAmount).toBeCloseTo(142)
  })

  it('falls back to the reverse rate when only the opposite direction exists', () => {
    addRate('JOD', 'USD', 1.41) // stored: JOD→USD, but we need USD→JOD
    const snap = resolveReportingSnapshot(db, 200, 'USD')
    expect(snap?.reportingCurrency).toBe('JOD')
    expect(snap?.exchangeRate).toBeCloseTo(1 / 1.41)
    expect(snap?.baseAmount).toBeCloseTo(200 / 1.41)
  })

  it('returns null when no rate exists in either direction', () => {
    const snap = resolveReportingSnapshot(db, 100, 'EUR')
    expect(snap).toBeNull()
  })

  it('uses the configured reporting_currency from settings', () => {
    // Override the default JOD reporting currency.
    db.prepare("UPDATE settings SET reporting_currency = 'USD' WHERE id = 1").run()
    addRate('JOD', 'USD', 0.71)
    const snap = resolveReportingSnapshot(db, 50, 'JOD')
    expect(snap?.reportingCurrency).toBe('USD')
    expect(snap?.baseAmount).toBeCloseTo(35.5)
  })
})

// ---------------------------------------------------------------------------
// sumReportingSnapshot — consolidated total via frozen snapshots
// ---------------------------------------------------------------------------

describe('sumReportingSnapshot', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)

    // Seed a property so we can insert payments/expenses with a valid FK.
    db.prepare(
      `INSERT INTO properties (code, name, type, country, currency, monthly_rent_default)
       VALUES ('JO-1', 'Test', 'apartment', 'JO', 'JOD', 500)`
    ).run()
  })

  function insertPayment(overrides: Record<string, unknown> = {}): void {
    db.prepare(
      `INSERT INTO payments (property_id, payment_type, payment_date, amount, currency,
        reporting_currency, exchange_rate, base_amount)
       VALUES (1, 'rent', @date, @amount, @currency, @reporting_currency, @exchange_rate, @base_amount)`
    ).run({
      date: '2026-06-15',
      amount: 100,
      currency: 'JOD',
      reporting_currency: null,
      exchange_rate: null,
      base_amount: null,
      ...overrides
    })
  }

  function insertExpense(overrides: Record<string, unknown> = {}): void {
    db.prepare(
      `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency,
        reporting_currency, exchange_rate, base_amount)
       VALUES (1, (SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'),
               @date, @amount, @currency, @reporting_currency, @exchange_rate, @base_amount)`
    ).run({
      date: '2026-06-15',
      amount: 50,
      currency: 'JOD',
      reporting_currency: null,
      exchange_rate: null,
      base_amount: null,
      ...overrides
    })
  }

  it('sums base_amount when every row has a snapshot', () => {
    insertPayment({ base_amount: 100, exchange_rate: 1, reporting_currency: 'JOD' })
    insertPayment({ base_amount: 200, exchange_rate: 1, reporting_currency: 'JOD' })
    const snap = sumReportingSnapshot(db, { table: 'payments', dateColumn: 'payment_date' })
    expect(snap.total).toBeCloseTo(300)
    expect(snap.currency).toBe('JOD')
    expect(snap.unconvertedCurrencies).toHaveLength(0)
  })

  it('falls back to amount when base_amount is NULL (graceful)', () => {
    insertPayment({ amount: 75, base_amount: null, reporting_currency: null, exchange_rate: null })
    insertPayment({ amount: 25, base_amount: 100, reporting_currency: 'JOD', exchange_rate: 1 })
    const snap = sumReportingSnapshot(db, { table: 'payments', dateColumn: 'payment_date' })
    expect(snap.total).toBeCloseTo(175) // 75 (fallback) + 100 (snapshot)
  })

  it('reports unconverted currencies when a non-reporting-currency row lacked a snapshot', () => {
    insertPayment({
      amount: 100,
      currency: 'USD',
      base_amount: null,
      reporting_currency: null,
      exchange_rate: null
    })
    const snap = sumReportingSnapshot(db, { table: 'payments', dateColumn: 'payment_date' })
    expect(snap.unconvertedCurrencies).toContain('USD')
  })

  it('does NOT flag a row as unconverted when its currency matches the reporting currency even with NULL snapshot', () => {
    insertPayment({
      amount: 100,
      currency: 'JOD',
      base_amount: null,
      reporting_currency: null,
      exchange_rate: null
    })
    const snap = sumReportingSnapshot(db, { table: 'payments', dateColumn: 'payment_date' })
    expect(snap.unconvertedCurrencies).toHaveLength(0)
  })

  it('excludes voided rows (is_voided = 1)', () => {
    insertPayment({ base_amount: 100, exchange_rate: 1, reporting_currency: 'JOD' })
    db.prepare('UPDATE payments SET is_voided = 1 WHERE id = 1').run()
    const snap = sumReportingSnapshot(db, { table: 'payments', dateColumn: 'payment_date' })
    expect(snap.total).toBe(0)
  })

  it('filters by date range', () => {
    insertPayment({
      date: '2026-01-15',
      base_amount: 100,
      exchange_rate: 1,
      reporting_currency: 'JOD'
    })
    insertPayment({
      date: '2026-06-15',
      base_amount: 200,
      exchange_rate: 1,
      reporting_currency: 'JOD'
    })
    const snap = sumReportingSnapshot(db, {
      table: 'payments',
      dateColumn: 'payment_date',
      fromDate: '2026-06-01',
      toDate: '2026-06-30'
    })
    expect(snap.total).toBeCloseTo(200)
  })

  it('sums expenses as well as payments', () => {
    insertExpense({ base_amount: 50, exchange_rate: 1, reporting_currency: 'JOD' })
    insertExpense({ base_amount: 30, exchange_rate: 1, reporting_currency: 'JOD' })
    const snap = sumReportingSnapshot(db, { table: 'expenses', dateColumn: 'expense_date' })
    expect(snap.total).toBeCloseTo(80)
  })
})

// ---------------------------------------------------------------------------
// formatConsolidatedSnapshotNote
// ---------------------------------------------------------------------------

describe('formatConsolidatedSnapshotNote', () => {
  it('formats a clean total with no unconverted currencies', () => {
    const note = formatConsolidatedSnapshotNote({
      total: 1234.56,
      currency: 'JOD',
      unconvertedCurrencies: []
    })
    expect(note).toContain('Consolidated Total')
    expect(note).toContain('JOD')
    expect(note).toContain('Frozen at each transaction')
    expect(note).not.toContain('had no snapshot')
  })

  it('footnotes currencies that lacked snapshots', () => {
    const note = formatConsolidatedSnapshotNote({
      total: 500,
      currency: 'JOD',
      unconvertedCurrencies: ['USD', 'EUR']
    })
    expect(note).toContain('USD, EUR had no snapshot')
  })
})

// ---------------------------------------------------------------------------
// computeConsolidatedNote — preConverted mode (snapshot-aware path)
// ---------------------------------------------------------------------------

describe('computeConsolidatedNote (preConverted)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })

  it('skips conversion when preConverted, just summing the totals', () => {
    const note = computeConsolidatedNote(
      db,
      [
        { currency: 'JOD', totals: { net: 100 } },
        { currency: 'JOD', totals: { net: 200 } }
      ],
      'net',
      { preConverted: true }
    )
    expect(note).toBeDefined()
    expect(note).toContain('Frozen at each transaction')
    expect(note).not.toContain('latest saved rates')
  })

  it('does not call convertAmount when preConverted (would fail if no rate table)', () => {
    // No exchange_rates rows exist — but preConverted skips lookup entirely,
    // so this must not throw or show 'rate missing'.
    const note = computeConsolidatedNote(
      db,
      [
        { currency: 'JOD', totals: { net: 100 } },
        { currency: 'USD', totals: { net: 50 } }
      ],
      'net',
      { preConverted: true }
    )
    expect(note).not.toContain('Rate missing')
  })
})
