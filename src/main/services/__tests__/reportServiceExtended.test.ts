/**
 * @file reportServiceExtended.test — verifies the 6 extended report builders produce correct,
 *         currency-grouped output with accurate financial calculations.
 *
 * INTENT: Each test seeds a small in-memory DB with cross-currency fixtures and asserts the
 *         report shape, per-currency totals, and calculation invariants (margin %, remaining,
 *         overdue days, status labels).
 * CONSTRAINT: Same seed pattern as reportService.test.ts for consistency.
 */
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { generateDuesForContract } from '../../db/duesGeneration'
import { runMigrations } from '../../db/migrations'
import { buildReport } from '../reportService'

describe('reportServiceExtended', () => {
  let db: Database.Database
  let propertyJod: number
  let propertyTry: number
  let tenantId: number
  let contractId: number
  let categoryId: number

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

    // Active contract on JOD property with escalation schedule.
    const contract = db
      .prepare(
        `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
           rent_amount, currency, payment_frequency, status, has_variable_escalation, contract_term_years)
         VALUES ('C-1', ?, ?, '2026-01-01', '2027-12-31', 500, 'JOD', 'monthly', 'active', 1, 2)`
      )
      .run(propertyJod, tenantId)
    contractId = Number(contract.lastInsertRowid)

    // Escalation schedule for the contract.
    db.prepare(
      `INSERT INTO rent_escalation_schedule (contract_id, year_number, effective_start_date, rent_amount)
       VALUES (?, 1, '2026-01-01', 500)`
    ).run(contractId)
    db.prepare(
      `INSERT INTO rent_escalation_schedule (contract_id, year_number, effective_start_date, rent_amount)
       VALUES (?, 2, '2027-01-01', 550)`
    ).run(contractId)

    // Payments across two currencies.
    db.prepare(
      `INSERT INTO payments (contract_id, property_id, tenant_id, payment_type, payment_date, amount, currency, receipt_number)
       VALUES (?, ?, ?, 'rent', '2026-07-01', 500, 'JOD', 'RCT-2026-000001')`
    ).run(contractId, propertyJod, tenantId)
    db.prepare(
      `INSERT INTO payments (contract_id, property_id, tenant_id, payment_type, payment_date, amount, currency, receipt_number)
       VALUES (NULL, ?, ?, 'rent', '2026-07-02', 8000, 'TRY', 'RCT-2026-000002')`
    ).run(propertyTry, tenantId)

    // Expense category.
    const cat = db
      .prepare("SELECT id FROM expense_categories WHERE name_key = 'expense.category.maintenance'")
      .get() as { id: number }
    categoryId = cat.id

    // Expenses across two currencies.
    db.prepare(
      `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
       VALUES (?, ?, '2026-07-03', 100, 'JOD')`
    ).run(propertyJod, categoryId)
    db.prepare(
      `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
       VALUES (?, ?, '2026-07-04', 2000, 'TRY')`
    ).run(propertyTry, categoryId)

    // Recurring expense template.
    db.prepare(
      `INSERT INTO recurring_expense_templates (property_id, category_id, name, description, amount, currency, frequency, day_of_month, start_date, next_due_date, is_active)
       VALUES (?, ?, 'Monthly Maintenance', 'Monthly maintenance', 100, 'JOD', 'monthly', 1, '2026-01-01', '2026-08-01', 1)`
    ).run(propertyJod, categoryId)

    // Document with expiry.
    db.prepare(
      `INSERT INTO documents (entity_type, entity_id, file_name, file_path, mime_type, file_size, document_type, issue_date, expiry_date, is_archived)
       VALUES ('property', ?, 'deed.pdf', '/tmp/deed.pdf', 'application/pdf', 1024, 'deed', '2025-01-01', '2026-12-31', 0)`
    ).run(propertyJod)
  })

  describe('property_profitability', () => {
    it('groups per currency and computes income, expense, net, and margin_percent', () => {
      const report = buildReport(db, 'property_profitability', { language: 'en' })
      expect(report.groups).toHaveLength(2)

      const jod = report.groups.find((g) => g.currency === 'JOD')
      expect(jod).toBeDefined()
      expect(jod?.totals.total_income).toBe(500)
      expect(jod?.totals.total_expense).toBe(100)
      expect(jod?.totals.net_profit).toBe(400)
      // margin_percent = 400 / 500 * 100 = 80
      const jodRow = jod?.rows.find((r) => r['currency'] === 'JOD')
      expect(jodRow?.['margin_percent']).toBe(80)
    })

    it('filters by property_id', () => {
      const report = buildReport(db, 'property_profitability', {
        property_id: propertyJod,
        language: 'en'
      })
      expect(report.groups).toHaveLength(1)
      expect(report.groups[0].currency).toBe('JOD')
      expect(report.groups[0].totals.total_income).toBe(500)
    })

    it('produces a consolidated group for multi-currency portfolios', () => {
      const report = buildReport(db, 'property_profitability', { language: 'en' })
      expect(report.consolidatedGroup).toBeDefined()
      expect(report.consolidatedGroup?.currency).toBeTruthy()
    })

    it('reports 0 margin_percent when income is zero', () => {
      // Add a property with expenses but no income.
      const prop = db
        .prepare(
          `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
           VALUES ('P-ZERO', 'Zero Income', 'apartment', 'JO', 'JOD', 'vacant', 0)`
        )
        .run()
      const propId = Number(prop.lastInsertRowid)
      db.prepare(
        `INSERT INTO expenses (property_id, category_id, expense_date, amount, currency)
         VALUES (?, ?, '2026-07-01', 200, 'JOD')`
      ).run(propId, categoryId)

      const report = buildReport(db, 'property_profitability', { property_id: propId })
      const row = report.groups[0]?.rows[0]
      expect(row?.['margin_percent']).toBe(0)
    })
  })

  describe('tenant_payment_history', () => {
    // Backdated contract so its dues are materialized past-due arrears for the report.
    function seedArrears(): number {
      const c = db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, status, has_variable_escalation)
           VALUES ('C-ARR', ?, ?, '2024-01-01', '2024-12-31', 500, 'JOD', 'monthly', 'active', 0)`
        )
        .run(propertyJod, tenantId)
      const cId = Number(c.lastInsertRowid)
      generateDuesForContract(db, cId)
      return cId
    }

    it('computes total_due/total_paid/remaining from the materialized dues schedule', () => {
      const cId = seedArrears()
      // Collect two of the twelve periods.
      db.prepare(
        `UPDATE rent_dues SET amount_paid = 500, status = 'paid'
         WHERE contract_id = ? AND period_key IN ('2024-01', '2024-02')`
      ).run(cId)

      const report = buildReport(db, 'tenant_payment_history', { language: 'en' })
      const jodGroup = report.groups.find((g) => g.currency === 'JOD')
      expect(jodGroup).toBeDefined()
      const row = jodGroup?.rows.find((r) => r['tenant_name'] === 'Tenant One')
      expect(row?.['total_due']).toBe(6000) // 12 * 500
      expect(row?.['total_paid']).toBe(1000) // 2 * 500
      expect(row?.['remaining']).toBe(5000)
    })

    it('remaining is clamped to zero when paid meets or exceeds due', () => {
      const cId = seedArrears()
      db.prepare(
        `UPDATE rent_dues SET amount_paid = amount_due, status = 'paid' WHERE contract_id = ?`
      ).run(cId)
      const report = buildReport(db, 'tenant_payment_history', { language: 'en' })
      const row = report.groups
        .flatMap((g) => g.rows)
        .find((r) => r['tenant_name'] === 'Tenant One')
      expect(row?.['remaining']).toBe(0)
    })

    it('has no consolidatedGroup (intentional per design)', () => {
      seedArrears()
      const report = buildReport(db, 'tenant_payment_history', { language: 'en' })
      expect(report.consolidatedGroup).toBeUndefined()
    })
  })

  describe('outstanding_balances', () => {
    function seedArrears(): number {
      const c = db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, status, has_variable_escalation)
           VALUES ('C-ARR', ?, ?, '2024-01-01', '2024-12-31', 500, 'JOD', 'monthly', 'active', 0)`
        )
        .run(propertyJod, tenantId)
      const cId = Number(c.lastInsertRowid)
      generateDuesForContract(db, cId)
      return cId
    }

    it('sums real arrears with aging buckets and a true days_overdue', () => {
      seedArrears()
      const report = buildReport(db, 'outstanding_balances', { language: 'en' })
      const jodGroup = report.groups.find((g) => g.currency === 'JOD')
      expect(jodGroup).toBeDefined()
      const row = jodGroup?.rows.find((r) => r['tenant_name'] === 'Tenant One')
      expect(row?.['amount_due']).toBe(6000) // all 12 periods outstanding
      expect(Number(row?.['days_overdue'])).toBeGreaterThan(0)
      // Every 2024 period is far in the past — all arrears land in the 90+ bucket.
      expect(row?.['aging_90_plus']).toBe(6000)
    })

    it('excludes dues that are already paid/settled', () => {
      const cId = seedArrears()
      db.prepare(`UPDATE rent_dues SET status = 'settled_before_app' WHERE contract_id = ?`).run(
        cId
      )
      const report = buildReport(db, 'outstanding_balances', { language: 'en' })
      const allRows = report.groups.flatMap((g) => g.rows)
      expect(allRows.find((r) => r['tenant_name'] === 'Tenant One')).toBeUndefined()
    })

    it('has no consolidatedGroup', () => {
      seedArrears()
      const report = buildReport(db, 'outstanding_balances', { language: 'en' })
      expect(report.consolidatedGroup).toBeUndefined()
    })
  })

  describe('dues_schedule', () => {
    function seedArrears(): number {
      const c = db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, status, has_variable_escalation)
           VALUES ('C-ARR', ?, ?, '2024-01-01', '2024-12-31', 500, 'JOD', 'monthly', 'active', 0)`
        )
        .run(propertyJod, tenantId)
      const cId = Number(c.lastInsertRowid)
      generateDuesForContract(db, cId)
      return cId
    }

    it('lists one row per period with localized status and outstanding', () => {
      const cId = seedArrears()
      db.prepare(
        `UPDATE rent_dues SET amount_paid = 200, status = 'partial' WHERE contract_id = ? AND period_key = '2024-01'`
      ).run(cId)

      const report = buildReport(db, 'dues_schedule', { language: 'en' })
      const jodGroup = report.groups.find((g) => g.currency === 'JOD')
      expect(jodGroup).toBeDefined()
      expect(jodGroup?.rows.length).toBe(12)

      const jan = jodGroup?.rows.find((r) => r['period'] === '2024-01')
      expect(jan?.['amount_due']).toBe(500)
      expect(jan?.['amount_paid']).toBe(200)
      expect(jan?.['outstanding']).toBe(300)
      expect(jan?.['status']).toBe('Partial')
    })

    it('filters by property_id', () => {
      seedArrears()
      const report = buildReport(db, 'dues_schedule', { property_id: propertyTry })
      const allRows = report.groups.flatMap((g) => g.rows)
      expect(allRows.length).toBe(0)
    })

    it('excludes future dues — only periods due today or overdue are reported', () => {
      // Contract spanning the past year through next year: future periods must not appear.
      const todayStr = new Date().toISOString().split('T')[0]
      const todayMs = new Date(todayStr).getTime()
      const start = new Date(todayMs - 100 * 86400000).toISOString().split('T')[0]
      const end = new Date(todayMs + 300 * 86400000).toISOString().split('T')[0]
      const c = db
        .prepare(
          `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
             rent_amount, currency, payment_frequency, status, has_variable_escalation)
           VALUES ('C-FUT', ?, ?, ?, ?, 500, 'JOD', 'monthly', 'active', 0)`
        )
        .run(propertyJod, tenantId, start, end)
      generateDuesForContract(db, Number(c.lastInsertRowid))

      const report = buildReport(db, 'dues_schedule', { language: 'en' })
      const allRows = report.groups.flatMap((g) => g.rows)
      expect(allRows.length).toBeGreaterThan(0)
      for (const row of allRows) {
        expect(String(row['due_date']) <= todayStr).toBe(true)
      }
    })
  })

  describe('contract_expiry', () => {
    it('lists active contracts with days_remaining and next_change', () => {
      const report = buildReport(db, 'contract_expiry', { language: 'en' })
      const jodGroup = report.groups.find((g) => g.currency === 'JOD')
      expect(jodGroup).toBeDefined()

      const row = jodGroup?.rows[0]
      expect(row).toBeDefined()
      expect(Number(row?.['days_remaining'])).toBeGreaterThan(0)
      expect(row?.['next_change']).toBeDefined()
      expect(row?.['current_rent']).toBe(500)
    })

    it('shows escalation schedule info in next_change when available', () => {
      const report = buildReport(db, 'contract_expiry', { language: 'en' })
      const jodGroup = report.groups.find((g) => g.currency === 'JOD')
      const row = jodGroup?.rows[0]
      // The next escalation step is Year 2 — eff. 2027-01-01.
      expect(String(row?.['next_change'])).toContain('Year')
    })

    it('filters by property_id', () => {
      const report = buildReport(db, 'contract_expiry', { property_id: propertyJod })
      const allRows = report.groups.flatMap((g) => g.rows)
      expect(allRows.length).toBe(1)
    })
  })

  describe('recurring_schedule', () => {
    it('lists recurring templates with amount, frequency, and status', () => {
      const report = buildReport(db, 'recurring_schedule', { language: 'en' })
      const jodGroup = report.groups.find((g) => g.currency === 'JOD')
      expect(jodGroup).toBeDefined()
      expect(jodGroup?.rows.length).toBeGreaterThanOrEqual(1)

      const row = jodGroup?.rows[0]
      expect(row?.['amount']).toBe(100)
      expect(row?.['frequency']).toBe('Monthly')
      expect(row?.['is_active']).toBe('Active')
      expect(row?.['next_due_date']).toBe('2026-08-01')
    })

    it('shows Ended status for templates past their end_date', () => {
      db.prepare(
        `INSERT INTO recurring_expense_templates (property_id, category_id, name, description, amount, currency, frequency, day_of_month, start_date, end_date, is_active)
         VALUES (?, ?, 'Old Template', 'Old', 50, 'JOD', 'monthly', 1, '2025-01-01', '2025-06-30', 0)`
      ).run(propertyJod, categoryId)

      const report = buildReport(db, 'recurring_schedule', { language: 'en' })
      const jodGroup = report.groups.find((g) => g.currency === 'JOD')
      const oldRow = jodGroup?.rows.find((r) => r['template_name'] === 'Old Template')
      expect(oldRow?.['is_active']).toBe('Ended')
    })

    it('filters by property_id', () => {
      const report = buildReport(db, 'recurring_schedule', { property_id: propertyJod })
      const allRows = report.groups.flatMap((g) => g.rows)
      allRows.forEach((r) => {
        expect(r['property_name']).toBe('JOD Apt')
      })
    })
  })

  describe('document_expiry', () => {
    it('lists documents with days_until_expiry and status_label', () => {
      const report = buildReport(db, 'document_expiry', { language: 'en' })
      expect(report.groups).toHaveLength(1)
      expect(report.groups[0].currency).toBe('—')

      const row = report.groups[0].rows[0]
      expect(row).toBeDefined()
      expect(row?.['document_type']).toBe('deed')
      expect(Number(row?.['days_until_expiry'])).toBeGreaterThan(0)
      expect(['Valid', 'Expiring Soon', 'Expired']).toContain(row?.['status_label'])
    })

    it('marks expired documents correctly', () => {
      db.prepare(
        `INSERT INTO documents (entity_type, entity_id, file_name, file_path, mime_type, file_size, expiry_date, is_archived)
         VALUES ('property', ?, 'old.pdf', '/tmp/old.pdf', 'application/pdf', 512, '2020-01-01', 0)`
      ).run(propertyJod)

      const report = buildReport(db, 'document_expiry', { language: 'en' })
      const expiredRow = report.groups[0].rows.find((r) => r['description'] === 'old.pdf')
      expect(expiredRow?.['status_label']).toBe('Expired')
      expect(Number(expiredRow?.['days_until_expiry'])).toBeLessThan(0)
    })

    it('filters by property_id', () => {
      const report = buildReport(db, 'document_expiry', { property_id: propertyJod })
      const allRows = report.groups[0].rows
      expect(allRows.length).toBeGreaterThanOrEqual(1)
    })
  })
})
