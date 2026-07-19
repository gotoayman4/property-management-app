/**
 * INTENT: Verifies the contracts:renew handler (FR-CON-04/13, SRS §11.3) and the
 *         terminate-regression fix (status='cancelled' instead of stale 'terminated').
 * CONSTRAINT: Per AGENTS — regression tests for bug fixes + tests for critical code.
 *             Uses the established ipcTestUtils harness so the full IPC layer (Zod
 *             validation + db.transaction + history logging + syncPropertyStatus) is
 *             exercised end-to-end against an in-memory SQLite db.
 */
import { ipcMain } from 'electron'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// eslint-disable-next-line import-x/order -- vitest vi.mock pattern forces structural separation
import { runMigrations } from '../../db/migrations'
const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  net: { fetch: vi.fn() }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))

import { registerContractIpcHandlers } from '../contractIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

afterEach((): void => resetDb(testDb))

let propertySeq = 0
function seedProperty(name = 'Test Property', currency = 'JOD'): number {
  propertySeq += 1
  return testDb
    .prepare(
      `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
       VALUES (?, ?, 'apartment', 'JO', ?, 'vacant', 0)`
    )
    .run(`P-${propertySeq}`, name, currency).lastInsertRowid as number
}

let tenantSeq = 0
function seedTenant(): number {
  tenantSeq += 1
  return testDb
    .prepare("INSERT INTO tenants (code, fullname, phone, is_active) VALUES (?, ?, '000', 1)")
    .run(`T-${tenantSeq}`, `Tenant ${tenantSeq}`).lastInsertRowid as number
}

function seedContract(
  overrides: Partial<{
    status: string
    start_date: string
    end_date: string
    rent_amount: number
    currency: string
    has_variable_escalation: number
    contract_term_years: number
    annual_increase_percent: number | null
    payment_frequency: string
  }> = {}
): number {
  const propertyId = seedProperty('Contract Prop', overrides.currency ?? 'JOD')
  const tenantId = seedTenant()
  const defaults = {
    contract_number: `C-${propertySeq}`,
    property_id: propertyId,
    tenant_id: tenantId,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    rent_amount: 1000,
    currency: 'JOD',
    status: 'active',
    contract_term_years: 1,
    has_variable_escalation: 0,
    annual_increase_percent: 5,
    payment_frequency: 'monthly'
  }
  const params = { ...defaults, ...overrides }
  return testDb
    .prepare(
      `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
         rent_amount, currency, status, contract_term_years, has_variable_escalation,
         annual_increase_percent, payment_frequency)
       VALUES (@contract_number, @property_id, @tenant_id, @start_date, @end_date,
               @rent_amount, @currency, @status, @contract_term_years, @has_variable_escalation,
               @annual_increase_percent, @payment_frequency)`
    )
    .run(params).lastInsertRowid as number
}

describe('contractRenewal IPC', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerContractIpcHandlers()
  })

  it('renews an active flat contract — extends end_date and updates rent', async () => {
    const id = seedContract({
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_amount: 1000,
      status: 'active'
    })
    const res = (await invoke(registry, 'contracts:renew', {
      contract_id: id,
      new_start_date: '2027-01-01',
      new_end_date: '2028-01-01',
      rent_amount: 1100,
      security_deposit: 0,
      has_variable_escalation: 0,
      contract_term_years: 1,
      annual_increase_percent: 5,
      notes: null
    })) as { success: boolean; id: number }
    expect(res.success).toBe(true)
    expect(res.id).toBe(id)

    const row = testDb.prepare('SELECT * FROM contracts WHERE id = ?').get(id) as {
      start_date: string
      end_date: string
      rent_amount: number
      status: string
    }
    expect(row.start_date).toBe('2027-01-01')
    expect(row.end_date).toBe('2028-01-01')
    expect(row.rent_amount).toBe(1100)
    expect(row.status).toBe('active')
  })

  it('renews an expired contract — flips status back to active', async () => {
    const id = seedContract({ status: 'expired', end_date: '2025-12-31' })
    const res = (await invoke(registry, 'contracts:renew', {
      contract_id: id,
      new_start_date: '2026-01-01',
      new_end_date: '2027-01-01',
      rent_amount: 1000,
      security_deposit: 0,
      has_variable_escalation: 0,
      contract_term_years: 1,
      annual_increase_percent: 5,
      notes: null
    })) as { success: boolean }
    expect(res.success).toBe(true)

    const row = testDb.prepare('SELECT status FROM contracts WHERE id = ?').get(id) as {
      status: string
    }
    expect(row.status).toBe('active')
  })

  it('renews a flat contract into variable escalation mode', async () => {
    const id = seedContract({
      has_variable_escalation: 0,
      annual_increase_percent: null,
      status: 'active'
    })
    const res = (await invoke(registry, 'contracts:renew', {
      contract_id: id,
      new_start_date: '2027-01-01',
      new_end_date: '2029-01-01',
      rent_amount: 1000,
      security_deposit: 0,
      has_variable_escalation: 1,
      contract_term_years: 2,
      annual_increase_percent: null,
      schedule: [
        {
          year_number: 1,
          effective_start_date: '2027-01-01',
          rent_amount: 1000,
          increase_percent_applied: 0
        },
        {
          year_number: 2,
          effective_start_date: '2028-01-01',
          rent_amount: 1050,
          increase_percent_applied: 5
        }
      ],
      notes: 'Switched to variable'
    })) as { success: boolean }
    expect(res.success).toBe(true)

    const contract = testDb.prepare('SELECT * FROM contracts WHERE id = ?').get(id) as {
      has_variable_escalation: number
      contract_term_years: number
    }
    expect(contract.has_variable_escalation).toBe(1)
    expect(contract.contract_term_years).toBe(2)

    const schedule = testDb
      .prepare('SELECT * FROM rent_escalation_schedule WHERE contract_id = ? ORDER BY year_number')
      .all(id) as Array<{ year_number: number; rent_amount: number }>
    expect(schedule).toHaveLength(2)
    expect(schedule[1].rent_amount).toBe(1050)
  })

  it('renews a variable contract into flat mode — clears old schedule', async () => {
    const id = seedContract({
      has_variable_escalation: 1,
      contract_term_years: 3,
      annual_increase_percent: null,
      status: 'active'
    })
    // Seed an old schedule so we can verify it's cleared.
    testDb
      .prepare(
        `
      INSERT INTO rent_escalation_schedule (contract_id, year_number, effective_start_date, rent_amount)
      VALUES (?, 1, '2026-01-01', 1000), (?, 2, '2027-01-01', 1050), (?, 3, '2028-01-01', 1100)
    `
      )
      .run(id, id, id)

    await invoke(registry, 'contracts:renew', {
      contract_id: id,
      new_start_date: '2029-01-01',
      new_end_date: '2030-01-01',
      rent_amount: 1200,
      security_deposit: 0,
      has_variable_escalation: 0,
      contract_term_years: 1,
      annual_increase_percent: 3,
      notes: null
    })

    const schedule = testDb
      .prepare('SELECT COUNT(*) AS c FROM rent_escalation_schedule WHERE contract_id = ?')
      .get(id) as { c: number }
    expect(schedule.c).toBe(0)
  })

  it('rejects renewal of a cancelled contract', async () => {
    const id = seedContract({ status: 'cancelled' })
    await expect(
      invoke(registry, 'contracts:renew', {
        contract_id: id,
        new_start_date: '2027-01-01',
        new_end_date: '2028-01-01',
        rent_amount: 1000,
        security_deposit: 0,
        has_variable_escalation: 0,
        contract_term_years: 1,
        annual_increase_percent: null,
        notes: null
      })
    ).rejects.toThrow('CONTRACT_NOT_RENEWABLE')
  })

  it('rejects renewal of a draft contract', async () => {
    const id = seedContract({ status: 'draft' })
    await expect(
      invoke(registry, 'contracts:renew', {
        contract_id: id,
        new_start_date: '2027-01-01',
        new_end_date: '2028-01-01',
        rent_amount: 1000,
        security_deposit: 0,
        has_variable_escalation: 0,
        contract_term_years: 1,
        annual_increase_percent: null,
        notes: null
      })
    ).rejects.toThrow('CONTRACT_NOT_RENEWABLE')
  })

  it('rejects renewal with new_end_date <= new_start_date', async () => {
    const id = seedContract({ status: 'active' })
    await expect(
      invoke(registry, 'contracts:renew', {
        contract_id: id,
        new_start_date: '2027-01-01',
        new_end_date: '2027-01-01',
        rent_amount: 1000,
        security_deposit: 0,
        has_variable_escalation: 0,
        contract_term_years: 1,
        annual_increase_percent: null,
        notes: null
      })
    ).rejects.toThrow('RENEWAL_END_BEFORE_START')
  })

  it('rejects variable renewal with an invalid schedule (BR-17: YEAR1 mismatch)', async () => {
    const id = seedContract({ status: 'active' })
    await expect(
      invoke(registry, 'contracts:renew', {
        contract_id: id,
        new_start_date: '2027-01-01',
        new_end_date: '2029-01-01',
        rent_amount: 1000,
        security_deposit: 0,
        has_variable_escalation: 1,
        contract_term_years: 2,
        annual_increase_percent: null,
        schedule: [
          { year_number: 1, effective_start_date: '2027-06-01', rent_amount: 1000 },
          { year_number: 2, effective_start_date: '2028-01-01', rent_amount: 1050 }
        ]
      })
    ).rejects.toThrow('YEAR1_NOT_CONTRACT_START')
  })

  it('logs contract_history with action_type renewed and prior state snapshot', async () => {
    const id = seedContract({
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_amount: 1000,
      status: 'active'
    })

    // Clear the 'created' history so we only have the 'renewed' entry.
    testDb.prepare('DELETE FROM contract_history WHERE contract_id = ?').run(id)

    await invoke(registry, 'contracts:renew', {
      contract_id: id,
      new_start_date: '2027-01-01',
      new_end_date: '2028-01-01',
      rent_amount: 1100,
      security_deposit: 0,
      has_variable_escalation: 0,
      contract_term_years: 1,
      annual_increase_percent: 5,
      notes: null
    })

    const history = testDb
      .prepare('SELECT * FROM contract_history WHERE contract_id = ? ORDER BY changed_at DESC')
      .all(id) as Array<{
      action_type: string
      previous_values_json: string | null
      changed_by_note: string | null
    }>
    expect(history).toHaveLength(1)
    expect(history[0].action_type).toBe('renewed')
    expect(history[0].changed_by_note).toContain('2027-01-01')
    expect(history[0].previous_values_json).not.toBeNull()

    const prior = JSON.parse(history[0].previous_values_json!) as Record<string, unknown>
    expect(prior.contract).toBeDefined()
    const c = prior.contract as Record<string, unknown>
    expect(c.end_date).toBe('2026-12-31')
    expect(c.rent_amount).toBe(1000)
  })

  it('property status stays rented after renewal', async () => {
    const id = seedContract({ status: 'active' })
    const propertyId = (
      testDb.prepare('SELECT property_id FROM contracts WHERE id = ?').get(id) as {
        property_id: number
      }
    ).property_id

    await invoke(registry, 'contracts:renew', {
      contract_id: id,
      new_start_date: '2027-01-01',
      new_end_date: '2028-01-01',
      rent_amount: 1100,
      security_deposit: 0,
      has_variable_escalation: 0,
      contract_term_years: 1,
      annual_increase_percent: 5,
      notes: null
    })

    const prop = testDb.prepare('SELECT status FROM properties WHERE id = ?').get(propertyId) as {
      status: string
    }
    expect(prop.status).toBe('rented')
  })

  it('REGRESSION: terminate writes status=cancelled (not terminated) [migration 014]', async () => {
    const id = seedContract({ status: 'active' })
    const res = (await invoke(registry, 'contracts:terminate', { id })) as { success: boolean }
    expect(res.success).toBe(true)

    const row = testDb
      .prepare('SELECT status, cancellation_reason FROM contracts WHERE id = ?')
      .get(id) as {
      status: string
      cancellation_reason: string | null
    }
    expect(row.status).toBe('cancelled')
  })
})
