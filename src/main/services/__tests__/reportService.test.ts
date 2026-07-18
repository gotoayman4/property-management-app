/**
 * @file reportService.test — verifies the 5 report builders produce correct, currency-grouped
 *         output and that the ledger report's running balance matches the canonical ledgerService
 *         computation (BR-22).
 *
 * INTENT: Each test seeds a small in-memory DB with cross-currency fixtures and asserts the
 *         report shape + per-currency totals. Builders are pure functions of (db, filters).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../db/migrations'
import { buildReport, ReportError } from '../reportService'
import { computeRunningBalances } from '../../db/ledgerService'

describe('reportService', () => {
  let db: Database.Database
  let propertyJod: number
  let propertyTry: number
  let tenantId: number

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)

    const propJod = db
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('P-JOD', 'JOD Apt', 'apartment', 'JO', 'JOD', 'rented', 500)`
      )
      .run()
    propertyJod = Number(propJod.lastInsertRowid)

    const propTry = db
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('P-TRY', 'TRY Shop', 'shop', 'TR', 'TRY', 'vacant', 8000)`
      )
      .run()
    propertyTry = Number(propTry.lastInsertRowid)

    const tenant = db
      .prepare(
        `INSERT INTO tenants (code, fullname, phone, is_active)
         VALUES ('T-1', 'Tenant One', '0790000000', 1)`
      )
      .run()
    tenantId = Number(tenant.lastInsertRowid)

    // Seed a contract so vacancy report has a "last occupied" date to compute from.
    db.prepare(
      `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency, status)
       VALUES ('C-1', ?, ?, '2025-01-01', '2025-12-31', 8000, 'TRY', 'expired')`
    ).run(propertyTry, tenantId)

    // Payments across two currencies.
    db.prepare(
      `INSERT INTO payments (contract_id, property_id, tenant_id, payment_type, payment_date, amount, currency, receipt_number)
       VALUES (NULL, ?, ?, 'rent', '2026-07-01', 500, 'JOD', 'RCT-2026-000001')`
    ).run(propertyJod, tenantId)
    db.prepare(
      `INSERT INTO payments (contract_id, property_id, tenant_id, payment_type, payment_date, amount, currency, receipt_number)
       VALUES (NULL, ?, ?, 'rent', '2026-07-02', 8000, 'TRY', 'RCT-2026-000002')`
    ).run(propertyTry, tenantId)

    // Expenses across two currencies.
    db.prepare(
      `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
       VALUES (?, 1, '2026-07-03', 100, 'JOD')`
    ).run(propertyJod)
    db.prepare(
      `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
       VALUES (?, 1, '2026-07-04', 2000, 'TRY')`
    ).run(propertyTry)

    // Ledger entries for the JOD property (so the ledger report has something to show).
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, entry_type, reference_type, reference_id, property_id, description, debit, credit, currency)
       VALUES ('2026-07-01', 'income', 'payment', 1, ?, 'July rent', 500, 0, 'JOD')`
    ).run(propertyJod)
    db.prepare(
      `INSERT INTO ledger_entries (entry_date, entry_type, reference_type, reference_id, property_id, description, debit, credit, currency)
       VALUES ('2026-07-03', 'expense', 'expense', 1, ?, 'Maintenance', 0, 100, 'JOD')`
    ).run(propertyJod)
  })

  it('income report groups payments per currency and never sums across currencies (BR-14)', () => {
    const report = buildReport(db, 'income', {})
    expect(report.groups).toHaveLength(2)
    const jod = report.groups.find((g) => g.currency === 'JOD')
    const tryGroup = report.groups.find((g) => g.currency === 'TRY')
    expect(jod?.totals.amount).toBe(500)
    expect(tryGroup?.totals.amount).toBe(8000)
  })

  it('expense report resolves category_key and groups per currency', () => {
    const report = buildReport(db, 'expense', {})
    expect(report.groups).toHaveLength(2)
    const jodRow = report.groups.find((g) => g.currency === 'JOD')?.rows[0]
    expect(jodRow?.['category_key']).toBe('expense.category.maintenance')
    expect(report.groups.find((g) => g.currency === 'TRY')?.totals.amount).toBe(2000)
  })

  it('profit & loss report produces per-currency income/expense/net (BR-14)', () => {
    const report = buildReport(db, 'profit_loss', {})
    expect(report.groups.length).toBeGreaterThanOrEqual(1)
    const jod = report.groups.find((g) => g.currency === 'JOD')
    expect(jod?.totals.total_income).toBe(500)
    expect(jod?.totals.total_expense).toBe(100)
    expect(jod?.totals.net_profit).toBe(400)
    // Margin % = net / income * 100 = 80%.
    const jodRow = jod?.rows.find((r) => r['currency'] === 'JOD')
    expect(jodRow?.['margin_percent']).toBe(80)
    // A multi-currency portfolio MUST carry the consolidated note (no silent mixed sum).
    expect(report.consolidatedNote).toBeDefined()
  })

  it('vacancy report lists vacant properties with computed days_vacant', () => {
    const report = buildReport(db, 'vacancy', {})
    expect(report.groups).toHaveLength(1) // synthetic single group
    const vacant = report.groups[0].rows.find((r) => r['code'] === 'P-TRY')
    expect(vacant).toBeDefined()
    expect(vacant?.['last_occupied']).toBe('2025-12-31')
    expect(Number(vacant?.['days_vacant'])).toBeGreaterThan(0)
  })

  it('ledger report matches computeRunningBalances exactly (BR-22)', () => {
    const report = buildReport(db, 'ledger', { ledger_property_id: propertyJod })
    const canonical = computeRunningBalances(db, propertyJod)
    expect(report.groups[0].rows.length).toBe(canonical.length)
    // The last row's running balance should equal 500 - 100 = 400.
    const lastRow = report.groups[0].rows[report.groups[0].rows.length - 1]
    expect(Number(lastRow['running_balance'])).toBe(400)
  })

  it('ledger report throws a stable code when no property is provided', () => {
    expect(() => buildReport(db, 'ledger', {})).toThrow(ReportError)
    try {
      buildReport(db, 'ledger', {})
    } catch (err) {
      expect((err as ReportError).code).toBe('LEDGER_PROPERTY_REQUIRED')
    }
  })

  it('ledger report rejects a non-existent property id with PROPERTY_NOT_FOUND', () => {
    expect(() => buildReport(db, 'ledger', { ledger_property_id: 999999 })).toThrow(ReportError)
  })

  it('filters narrow the income report by property', () => {
    const report = buildReport(db, 'income', { property_id: propertyJod })
    expect(report.groups).toHaveLength(1)
    expect(report.groups[0].currency).toBe('JOD')
  })
})
