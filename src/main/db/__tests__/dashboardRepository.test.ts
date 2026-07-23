import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getDashboardSummary,
  getRecentPayments,
  getRecentExpenses,
  getUpcomingDue,
  getOverduePayments,
  getUpcomingRecurring,
  getExpiringDocuments,
  getFinancialTrends
} from '../dashboardRepository'
import { runMigrations } from '../migrations'

describe('dashboardRepository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    db.prepare(
      "INSERT OR IGNORE INTO countries (code, name, default_currency, is_active) VALUES ('US', 'United States', 'USD', 1), ('TR', 'Turkey', 'TRY', 1)"
    ).run()
  })

  afterEach(() => {
    db.close()
  })

  it('returns zeroed summary for empty database', () => {
    const summary = getDashboardSummary(db)
    expect(summary.totalProperties).toBe(0)
    expect(summary.rentedProperties).toBe(0)
    expect(summary.totalTenants).toBe(0)
    expect(summary.activeContracts).toBe(0)
    expect(summary.consolidatedSummary.total_income).toBe(0)
    expect(summary.consolidatedSummary.total_expenses).toBe(0)
  })

  it('calculates counts correctly when records exist', () => {
    db.prepare(
      "INSERT INTO properties (code, name, address, currency, status, type, country) VALUES ('P1', 'Prop 1', 'Addr', 'USD', 'rented', 'apartment', 'US')"
    ).run()
    db.prepare(
      "INSERT INTO properties (code, name, address, currency, status, type, country) VALUES ('P2', 'Prop 2', 'Addr', 'USD', 'vacant', 'apartment', 'US')"
    ).run()
    db.prepare(
      "INSERT INTO tenants (code, fullname, phone, is_active) VALUES ('T1', 'Tenant 1', '123', 1)"
    ).run()

    const summary = getDashboardSummary(db)
    expect(summary.totalProperties).toBe(2)
    expect(summary.rentedProperties).toBe(1)
    expect(summary.totalTenants).toBe(1)
  })

  it('filters metrics by country correctly', () => {
    db.prepare(
      "INSERT INTO properties (code, name, address, currency, country, status, type) VALUES ('P1', 'US Prop', 'Addr', 'USD', 'US', 'rented', 'apartment')"
    ).run()
    db.prepare(
      "INSERT INTO properties (code, name, address, currency, country, status, type) VALUES ('P2', 'TR Prop', 'Addr', 'TRY', 'TR', 'rented', 'apartment')"
    ).run()

    const usSummary = getDashboardSummary(db, 'US')
    expect(usSummary.totalProperties).toBe(1)

    const trSummary = getDashboardSummary(db, 'TR')
    expect(trSummary.totalProperties).toBe(1)
  })

  it('returns recent payments and expenses arrays', () => {
    expect(getRecentPayments(db)).toBeInstanceOf(Array)
    expect(getRecentExpenses(db)).toBeInstanceOf(Array)
    expect(getUpcomingDue(db)).toBeInstanceOf(Array)
    expect(getOverduePayments(db)).toBeInstanceOf(Array)
    expect(getUpcomingRecurring(db)).toBeInstanceOf(Array)
    expect(getExpiringDocuments(db)).toBeInstanceOf(Array)
  })

  it('returns 12-month financial trend structure', () => {
    const trends = getFinancialTrends(db)
    expect(trends.income).toBeInstanceOf(Array)
    expect(trends.expense).toBeInstanceOf(Array)
    expect(trends.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(trends.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
