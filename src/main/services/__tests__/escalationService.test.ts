/**
 * @file escalationService.test — tests for automatic rent escalation application.
 *
 * INTENT: Verify applyDueEscalations applies the correct past-due step to active
 *         variable-escalation contracts, is idempotent, records audit trail (BR-07),
 *         and skips non-variable/already-matching contracts.
 * CONSTRAINT: Each test uses a fresh in-memory DB to avoid state leakage.
 */
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from '../../db/migrations'
import { applyDueEscalations } from '../escalationService'

describe('escalationService', () => {
  let db: Database.Database
  let propertyId: number

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)

    const prop = db
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('P-1', 'Test Prop', 'apartment', 'JO', 'JOD', 'rented', 500)`
      )
      .run()
    propertyId = Number(prop.lastInsertRowid)
  })

  let tenantSeq = 0

  function createTenant(): number {
    tenantSeq++
    const t = db
      .prepare(
        `INSERT INTO tenants (code, fullname, phone, is_active)
         VALUES (?, 'Tenant', '0790000000', 1)`
      )
      .run(`T-${tenantSeq}`)
    return Number(t.lastInsertRowid)
  }

  function createContract(
    overrides: {
      status?: string
      has_variable_escalation?: number
      rent_amount?: number
      start_date?: string
      end_date?: string
    } = {}
  ): number {
    const tenantId = createTenant()
    const c = db
      .prepare(
        `INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date,
           rent_amount, currency, payment_frequency, status, has_variable_escalation)
         VALUES (?, ?, ?, ?, ?, ?, 'JOD', 'monthly', ?, ?)`
      )
      .run(
        `C-${Date.now()}-${Math.random()}`,
        propertyId,
        tenantId,
        overrides.start_date ?? '2026-01-01',
        overrides.end_date ?? '2028-12-31',
        overrides.rent_amount ?? 1000,
        overrides.status ?? 'active',
        overrides.has_variable_escalation ?? 1
      )
    return Number(c.lastInsertRowid)
  }

  function addEscalationStep(
    contractId: number,
    yearNumber: number,
    effectiveDate: string,
    rentAmount: number
  ): void {
    db.prepare(
      `INSERT INTO rent_escalation_schedule (contract_id, year_number, effective_start_date, rent_amount)
       VALUES (?, ?, ?, ?)`
    ).run(contractId, yearNumber, effectiveDate, rentAmount)
  }

  describe('applyDueEscalations', () => {
    it('applies a past-due escalation step to an active variable-escalation contract', () => {
      const contractId = createContract({ rent_amount: 1000 })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2026-07-01', 1050)

      const applied = applyDueEscalations(db)
      expect(applied).toBe(1)

      const contract = db
        .prepare('SELECT rent_amount FROM contracts WHERE id = ?')
        .get(contractId) as { rent_amount: number }
      expect(contract.rent_amount).toBe(1050)
    })

    it('is idempotent — calling twice does not re-apply an already-matched step', () => {
      const contractId = createContract({ rent_amount: 1000 })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2026-07-01', 1050)

      applyDueEscalations(db)
      const applied2 = applyDueEscalations(db)
      expect(applied2).toBe(0)
    })

    it('skips contracts where rent already matches via epsilon (< 0.01 difference)', () => {
      const contractId = createContract({ rent_amount: 1050 })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2026-07-01', 1050.005) // within epsilon

      const applied = applyDueEscalations(db)
      expect(applied).toBe(0)
    })

    it('records audit trail in contract_history with action_type=amended (BR-07)', () => {
      const contractId = createContract({ rent_amount: 1000 })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2026-07-01', 1100)

      applyDueEscalations(db)

      const history = db
        .prepare('SELECT * FROM contract_history WHERE contract_id = ?')
        .all(contractId) as Array<{
        action_type: string
        previous_values_json: string
        changed_by_note: string
      }>
      expect(history).toHaveLength(1)
      expect(history[0].action_type).toBe('amended')
      const prev = JSON.parse(history[0].previous_values_json)
      expect(prev.rent_amount).toBe(1000)
      expect(history[0].changed_by_note).toContain('Year 2')
      expect(history[0].changed_by_note).toContain('1000')
      expect(history[0].changed_by_note).toContain('1100')
    })

    it('skips non-variable-escalation contracts', () => {
      const contractId = createContract({
        rent_amount: 1000,
        has_variable_escalation: 0
      })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2026-07-01', 1050)

      const applied = applyDueEscalations(db)
      expect(applied).toBe(0)
    })

    it('skips expired contracts', () => {
      const contractId = createContract({
        rent_amount: 1000,
        status: 'expired'
      })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2026-07-01', 1050)

      const applied = applyDueEscalations(db)
      expect(applied).toBe(0)
    })

    it('skips contracts where the escalation step is not yet due', () => {
      const contractId = createContract({ rent_amount: 1000 })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2027-01-01', 1050) // future

      const applied = applyDueEscalations(db)
      expect(applied).toBe(0)

      const contract = db
        .prepare('SELECT rent_amount FROM contracts WHERE id = ?')
        .get(contractId) as { rent_amount: number }
      expect(contract.rent_amount).toBe(1000)
    })

    it('handles multiple contracts independently — some due, some not', () => {
      const c1 = createContract({ rent_amount: 1000 })
      addEscalationStep(c1, 1, '2026-01-01', 1000)
      addEscalationStep(c1, 2, '2026-07-01', 1100) // due

      const c2 = createContract({ rent_amount: 2000 })
      addEscalationStep(c2, 1, '2026-01-01', 2000)
      addEscalationStep(c2, 2, '2027-01-01', 2200) // not due

      const applied = applyDueEscalations(db)
      expect(applied).toBe(1)

      const r1 = db.prepare('SELECT rent_amount FROM contracts WHERE id = ?').get(c1) as {
        rent_amount: number
      }
      const r2 = db.prepare('SELECT rent_amount FROM contracts WHERE id = ?').get(c2) as {
        rent_amount: number
      }
      expect(r1.rent_amount).toBe(1100)
      expect(r2.rent_amount).toBe(2000)
    })

    it('returns 0 when no contracts exist', () => {
      expect(applyDueEscalations(db)).toBe(0)
    })

    it('applies the correct step when multiple past-due steps exist (takes the latest)', () => {
      const contractId = createContract({ rent_amount: 1000 })
      addEscalationStep(contractId, 1, '2026-01-01', 1000)
      addEscalationStep(contractId, 2, '2026-03-01', 1050)
      addEscalationStep(contractId, 3, '2026-06-01', 1100)

      const applied = applyDueEscalations(db)
      expect(applied).toBe(1)

      const contract = db
        .prepare('SELECT rent_amount FROM contracts WHERE id = ?')
        .get(contractId) as { rent_amount: number }
      expect(contract.rent_amount).toBe(1100)
    })
  })
})
