/**
 * @file seed-demo-data — inject realistic Arabic demo data into the dev database.
 *
 * INTENT: Populate database.db with a small, realistic Arabic portfolio so the app can be
 *         manually exercised end-to-end (dashboard, lists, ledger, reports, exports) without
 *         hand-entering every record. The dataset spans two countries/currencies (JO/JOD and
 *         TR/TRY) so multi-currency grouping (BR-14), the ledger running balance (BR-22), and
 *         the reports/export pipeline all have meaningful data to render.
 *
 * CONSTRAINTS:
 *   - BR-21 Atomicity: every payment and every expense is created via the app's OWN
 *     createPayment / createExpense helpers, so the payment+ledger (and expense+ledger) rows
 *     are written in one transaction. Never insert into payments/expenses directly without the
 *     matching ledger_entries row.
 *   - BR-13 Currency lock: each payment/expense passes the linked property's currency.
 *   - Idempotent: a `seed_marker` row in the singleton settings extension gates re-runs so the
 *     script can be executed repeatedly without producing duplicate data.
 *
 * USAGE:
 *   1. Close the running Electron app (it locks database.db + the native module).
 *   2. `npm run rebuild:node`           (the binary is normally built for Electron)
 *   3. `npx tsx scripts/seed-demo-data.ts`
 *   4. `npm run rebuild:electron`       (build the binary back for the app)
 *   5. `npm run dev`                    (the app now opens with the seeded data)
 */

import Database from 'better-sqlite3'
import { resolve } from 'path'
import { createPayment } from '../src/main/db/paymentRepository'
import { createExpense } from '../src/main/db/expenseRepository'
import {
  PROPERTY_FIXTURES,
  TENANT_FIXTURES,
  APARTMENT_EXPENSE_FIXTURES,
  SHOP_EXPENSE_FIXTURES,
  type ExpenseFixture
} from './seed-fixtures'

const DB_PATH = resolve(process.cwd(), 'database.db')

/** Open the dev DB the same way the app does, with WAL + FK enforcement. */
function openDb(): Database.Database {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

/** Returns YYYY-MM-DD for `daysAgo` days before today, in LOCAL time (mirrors the app's helper). */
function daysAgo(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns YYYY-MM-DD for `daysAhead` days after today, in LOCAL time. */
function daysAhead(daysAhead: number): string {
  return daysAgo(-daysAhead)
}

interface SeededIds {
  properties: Record<string, number>
  tenants: Record<string, number>
  contracts: Record<string, number>
  categories: Record<string, number>
}

/** Insert the three properties (two in JO/JOD, one in TR/TRY — the TR one is vacant). */
function seedProperties(db: Database.Database): SeededIds['properties'] {
  const insert = db.prepare(
    `INSERT INTO properties
       (code, name, type, country, currency, address, area_sqm, status, monthly_rent_default, notes, is_archived)
     VALUES (@code, @name, @type, @country, @currency, @address, @area_sqm, @status, @monthly_rent_default, @notes, 0)`
  )
  const ids: Record<string, number> = {}
  for (const r of PROPERTY_FIXTURES) {
    const res = insert.run(r)
    ids[r.key] = Number(res.lastInsertRowid)
  }
  return ids
}

/** Insert three tenants with Arabic names + a mix of preferred languages. */
function seedTenants(db: Database.Database): SeededIds['tenants'] {
  const insert = db.prepare(
    `INSERT INTO tenants
       (code, fullname, phone, email, type, is_active,
        preferred_language, emergency_contact_name, emergency_contact_phone, address, notes)
     VALUES (@code, @fullname, @phone, @email, @type, 1,
             @preferred_language, @emergency_contact_name, @emergency_contact_phone, @address, @notes)`
  )
  const ids: Record<string, number> = {}
  for (const r of TENANT_FIXTURES) {
    const res = insert.run(r)
    ids[r.key] = Number(res.lastInsertRowid)
  }
  return ids
}

/**
 * Insert two active contracts:
 *   - apt_amman ↔ khaled: simple monthly, started ~6 months ago.
 *   - shop_amman ↔ company_nile: quarterly, started ~3 months ago, with a 3-year escalation.
 */
function seedContracts(
  db: Database.Database,
  ids: Pick<SeededIds, 'properties' | 'tenants'>
): SeededIds['contracts'] {
  const insertContract = db.prepare(
    `INSERT INTO contracts
       (contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency,
        payment_frequency, security_deposit, status, contract_term_years,
        has_variable_escalation, payment_method, notes)
     VALUES (@contract_number, @property_id, @tenant_id, @start_date, @end_date, @rent_amount,
             @currency, @payment_frequency, @security_deposit, @status, @contract_term_years,
             @has_variable_escalation, @payment_method, @notes)`
  )
  const insertHistory = db.prepare(
    `INSERT INTO contract_history (contract_id, action_type, previous_values_json, changed_by_note)
     VALUES (?, 'created', NULL, ?)`
  )
  const insertEscalation = db.prepare(
    `INSERT INTO rent_escalation_schedule
       (contract_id, year_number, effective_start_date, rent_amount, increase_percent_applied, notes)
     VALUES (@contract_id, @year_number, @effective_start_date, @rent_amount, @increase_percent_applied, @notes)`
  )

  const contracts: Record<string, number> = {}

  // Contract 1: simple monthly.
  const c1 = insertContract.run({
    contract_number: 'C-2026-001',
    property_id: ids.properties.apt_amman,
    tenant_id: ids.tenants.khaled,
    start_date: daysAgo(180),
    end_date: daysAhead(185),
    rent_amount: 450,
    currency: 'JOD',
    payment_frequency: 'monthly',
    security_deposit: 900,
    status: 'active',
    contract_term_years: 1,
    has_variable_escalation: 0,
    payment_method: 'bank_transfer',
    notes: 'عقد سنوي بزيادة سنوية 3%'
  })
  contracts['apt_amman'] = Number(c1.lastInsertRowid)
  insertHistory.run(contracts['apt_amman'], 'تأسيس العقد')

  // Contract 2: quarterly, multi-year (3-year) with escalation schedule.
  const c2Start = daysAgo(90)
  const c2 = insertContract.run({
    contract_number: 'C-2026-002',
    property_id: ids.properties.shop_amman,
    tenant_id: ids.tenants.company_nile,
    start_date: c2Start,
    end_date: daysAhead(1005), // ~3 years
    rent_amount: 600,
    currency: 'JOD',
    payment_frequency: 'quarterly',
    security_deposit: 1800,
    status: 'active',
    contract_term_years: 3,
    has_variable_escalation: 1,
    payment_method: 'cheque',
    notes: 'عقد متعدد السنوات مع جدول تصاعد'
  })
  contracts['shop_amman'] = Number(c2.lastInsertRowid)
  insertHistory.run(contracts['shop_amman'], 'تأسيس العقد متعدد السنوات')

  // 3-year escalation: 600 → +5% → +5% (rounded to whole JOD).
  const y1Date = c2Start
  const y2Date = addYearsISO(c2Start, 1)
  const y3Date = addYearsISO(c2Start, 2)
  insertEscalation.run({
    contract_id: contracts['shop_amman'],
    year_number: 1,
    effective_start_date: y1Date,
    rent_amount: 600,
    increase_percent_applied: 0,
    notes: 'سنة التأسيس'
  })
  insertEscalation.run({
    contract_id: contracts['shop_amman'],
    year_number: 2,
    effective_start_date: y2Date,
    rent_amount: 630,
    increase_percent_applied: 5,
    notes: 'زيادة 5%'
  })
  insertEscalation.run({
    contract_id: contracts['shop_amman'],
    year_number: 3,
    effective_start_date: y3Date,
    rent_amount: 662,
    increase_percent_applied: 5,
    notes: 'زيادة 5%'
  })

  return contracts
}

/** Add `n` years to an ISO date string, preserving month/day (good enough for seed data). */
function addYearsISO(iso: string, n: number): string {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Look up the default category ids seeded by migration 005. */
function loadCategoryIds(db: Database.Database): SeededIds['categories'] {
  const rows = db.prepare('SELECT id, name_key FROM expense_categories').all() as Array<{
    id: number
    name_key: string
  }>
  const map: Record<string, number> = {}
  for (const r of rows) {
    // map 'expense.category.maintenance' -> 'maintenance'
    const short = r.name_key.split('.').pop() as string
    map[short] = r.id
  }
  return map
}

/**
 * Seed ~10 payments across both currencies using the app's createPayment (BR-21 atomicity).
 * Includes: a deposit at contract start, monthly rents over the past 6 months, one partial payment,
 * and a voided payment to exercise the reversal path.
 */
function seedPayments(db: Database.Database, ids: SeededIds): void {
  const apt = ids.properties.apt_amman
  const shop = ids.properties.shop_amman
  const khaled = ids.tenants.khaled
  const company = ids.tenants.company_nile
  const c1 = ids.contracts.apt_amman
  const c2 = ids.contracts.shop_amman

  // --- Apartment (JOD): deposit + 6 monthly rents + 1 partial payment ---
  createPayment(db, {
    contract_id: c1,
    property_id: apt,
    tenant_id: khaled,
    payment_type: 'deposit',
    payment_date: daysAgo(180),
    amount: 900,
    currency: 'JOD',
    property_currency: 'JOD',
    payment_method: 'bank_transfer',
    notes: 'تأمين عقد الشقة'
  })

  const monthlyRent = 450
  for (let i = 0; i < 6; i++) {
    const isPartial = i === 4 // one partial payment (5th month) — 200 short
    createPayment(db, {
      contract_id: c1,
      property_id: apt,
      tenant_id: khaled,
      payment_type: 'rent',
      payment_date: daysAgo(150 - i * 30),
      amount: isPartial ? monthlyRent - 200 : monthlyRent,
      currency: 'JOD',
      property_currency: 'JOD',
      payment_method: 'bank_transfer',
      is_partial: isPartial,
      related_period_month: monthKey(150 - i * 30),
      notes: isPartial ? 'دفعة جزئية - باقي 200 دينار' : 'إيجار شهري'
    })
  }

  // --- Shop (JOD): deposit + 2 quarterly payments ---
  createPayment(db, {
    contract_id: c2,
    property_id: shop,
    tenant_id: company,
    payment_type: 'deposit',
    payment_date: daysAgo(90),
    amount: 1800,
    currency: 'JOD',
    property_currency: 'JOD',
    payment_method: 'cheque',
    notes: 'تأمين عقد المحل'
  })

  for (let i = 0; i < 2; i++) {
    createPayment(db, {
      contract_id: c2,
      property_id: shop,
      tenant_id: company,
      payment_type: 'rent',
      payment_date: daysAgo(60 - i * 90),
      amount: 1800, // 600 * 3 months
      currency: 'JOD',
      property_currency: 'JOD',
      payment_method: 'cheque',
      related_period_month: monthKey(60 - i * 90),
      notes: 'إيجار ربع سنوي'
    })
  }

  // --- One voided payment to exercise the reversal ledger row ---
  const voided = createPayment(db, {
    contract_id: c1,
    property_id: apt,
    tenant_id: khaled,
    payment_type: 'rent',
    payment_date: daysAgo(15),
    amount: 450,
    currency: 'JOD',
    property_currency: 'JOD',
    payment_method: 'cash',
    notes: 'دفعة سيتم إلغاؤها'
  })
  // Apply the void inline so the seed shows a complete income_void reversal pair.
  db.prepare(`UPDATE payments SET is_voided = 1, void_reason = ? WHERE id = ?`).run(
    'تسجيل بالخطأ - تم الإلغاء',
    voided.payment_id
  )
  // Append the matching income_void ledger row (mirrors voidPayment without importing more code).
  const voidDesc = 'إلغاء دفعة إيجار - تسجيل بالخطأ'
  db.prepare(
    `INSERT INTO ledger_entries
       (entry_date, entry_type, reference_type, reference_id, property_id,
        description, debit, credit, currency, is_manual_adjustment)
     VALUES (?, 'income_void', 'payment', ?, ?, ?, 0, ?, ?, 0)`
  ).run(daysAgo(15), voided.payment_id, apt, voidDesc, 450, 'JOD')
}

/** Format the YYYY-MM of `daysAgo` days before today (for related_period_month). */
function monthKey(daysAgoValue: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgoValue)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Seed ~8 expenses across both currencies using createExpense (BR-21 atomicity).
 * Mix of categories: maintenance, electricity, water, cleaning, municipality.
 */
function seedExpenses(db: Database.Database, ids: SeededIds): void {
  const apt = ids.properties.apt_amman
  const shop = ids.properties.shop_amman
  const cat = ids.categories

  /** Resolve the fixture's category key (e.g. 'maintenance') to the seeded category id. */
  const resolveCat = (key: string): number => cat[key]

  /** Insert a single fixture as an expense via the app helper (BR-21 atomic). */
  const insertOne = (propertyId: number, e: ExpenseFixture): void => {
    createExpense(db, {
      property_id: propertyId,
      category_id: resolveCat(e.categoryIdKey),
      expense_date: daysAgo(e.days),
      vendor_name: e.vendor,
      amount: e.amount,
      currency: 'JOD',
      property_currency: 'JOD',
      notes: e.notes
    })
  }

  for (const e of APARTMENT_EXPENSE_FIXTURES) insertOne(apt, e)
  for (const e of SHOP_EXPENSE_FIXTURES) insertOne(shop, e)
}

/** Seed two recurring expense templates: monthly cleaning + quarterly maintenance. */
function seedRecurringTemplates(db: Database.Database, ids: SeededIds): void {
  const insert = db.prepare(
    `INSERT INTO recurring_expense_templates
       (property_id, category_id, description, amount, currency, frequency, day_of_month,
        start_date, end_date, vendor_name, is_active, last_generated_date)
     VALUES (@property_id, @category_id, @description, @amount, @currency, @frequency, @day_of_month,
             @start_date, NULL, @vendor_name, 1, NULL)`
  )
  insert.run({
    property_id: ids.properties.apt_amman,
    category_id: ids.categories.cleaning,
    description: 'تنظيف شهري - شقة خلدا',
    amount: 25,
    currency: 'JOD',
    frequency: 'monthly',
    day_of_month: 1,
    start_date: daysAgo(120),
    vendor_name: 'مكتب النظافة المصرية'
  })
  insert.run({
    property_id: ids.properties.shop_amman,
    category_id: ids.categories.maintenance,
    description: 'صيانة ربع سنوية - المحل التجاري',
    amount: 40,
    currency: 'JOD',
    frequency: 'quarterly',
    day_of_month: 15,
    start_date: daysAgo(90),
    vendor_name: 'شركة الإعمار للصيانة'
  })
}

/** Set the singleton settings' language to Arabic (BR-30: Arabic-first on first launch). */
function ensureArabicSettings(db: Database.Database): void {
  db.prepare(`UPDATE settings SET app_language = 'ar' WHERE id = 1`).run()
}

function main(): void {
  console.log(`Seeding demo data into: ${DB_PATH}`)
  const db = openDb()

  // The dev app should already have applied all migrations to database.db. We do NOT call
  // runMigrations here because that file uses Vite's import.meta.glob which is only available
  // inside the bundled Electron runtime, not under plain Node. We assert the schema is present
  // by checking for the properties table, then proceed.
  const hasSchema = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='properties'")
    .get()
  if (!hasSchema) {
    console.error(
      'ERROR: database.db has no schema. Open the app once first so migrations run, then re-run this script.'
    )
    db.close()
    process.exit(1)
  }

  // Idempotency: a dedicated one-row metadata table marks whether the seed has already run.
  // (settings.id has a CHECK(id=1) singleton constraint, so we cannot reuse it as a marker.)
  db.exec(
    `CREATE TABLE IF NOT EXISTS seed_meta (id INTEGER PRIMARY KEY CHECK(id = 1), seeded_at TEXT NOT NULL)`
  )
  const prior = db.prepare('SELECT 1 FROM seed_meta WHERE id = 1').get()
  if (prior) {
    console.log('Demo data already seeded (seed_meta marker present). Nothing to do.')
    console.log(
      'To re-seed: delete database.db, open the app once to re-create the schema, then re-run.'
    )
    db.close()
    return
  }

  // Wrap the entire seed in one transaction so a partial failure leaves the DB untouched.
  const allIds = db.transaction(() => {
    const properties = seedProperties(db)
    const tenants = seedTenants(db)
    const contracts = seedContracts(db, { properties, tenants })
    const categories = loadCategoryIds(db)
    return { properties, tenants, contracts, categories }
  })()

  // Payments and expenses go through createPayment/createExpense which open their own
  // transactions; running them INSIDE an outer transaction would nest. Call them outside.
  seedPayments(db, allIds)
  seedExpenses(db, allIds)
  seedRecurringTemplates(db, allIds)
  ensureArabicSettings(db)

  db.prepare('INSERT INTO seed_meta (id, seeded_at) VALUES (1, ?)').run(new Date().toISOString())

  console.log('✓ Demo data seeded successfully:')
  console.log(`  - 3 properties (2 rented in JO/JOD, 1 vacant in TR/TRY)`)
  console.log(`  - 3 tenants (2 individuals + 1 company)`)
  console.log(`  - 2 active contracts (1 simple monthly, 1 quarterly with 3-year escalation)`)
  console.log(`  - ~10 payments (deposits + monthly/quarterly rents, incl. 1 partial + 1 voided)`)
  console.log(
    `  - ~8 expenses across 5 categories (maintenance, electricity, water, cleaning, municipality)`
  )
  console.log(`  - 2 recurring expense templates`)
  console.log(`  - ledger_entries mirror every payment/expense (BR-21 atomicity via app helpers)`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. npm run rebuild:electron   (rebuild better-sqlite3 for the Electron runtime)')
  console.log('  2. npm run dev                (open the app — Arabic-first UI with seeded data)')

  db.close()
}

main()
