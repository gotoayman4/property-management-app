import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  validateEscalationSchedule,
  persistSchedule,
  type EscalationYearInput,
  EscalationValidationError
} from '../db/contractEscalation'
import { checkOverlap, syncPropertyStatus, logHistory } from '../db/contractHelpers'
import { db } from '../db/database'
import { appendLedgerEntry } from '../db/ledgerService'
import { createPayment } from '../db/paymentRepository'

const isDev = process.env.NODE_ENV !== 'production'

/**
 * INTENT: IPC handlers for the contracts domain (renamed from leases) + multi-year escalation.
 * CONSTRAINT: All writes that touch escalation or status changes are atomic (db.transaction)
 *             and log to contract_history (BR-07). Channels use the domain:verb convention.
 */

import {
  contractCreateSchema,
  contractUpdateSchema,
  contractRenewSchema,
  escalationSetSchema
} from './contractSchemas'

export function registerContractIpcHandlers(): void {
  ipcMain.handle(
    'contracts:list',
    async (_, filters?: { status?: string; property_id?: number; tenant_id?: number }) => {
      try {
        let query = `
          SELECT c.*,
                 p.name AS property_name, p.code AS property_code,
                 t.fullname AS tenant_fullname, t.code AS tenant_code
          FROM contracts c
          JOIN properties p ON c.property_id = p.id
          JOIN tenants t ON c.tenant_id = t.id
          WHERE c.is_archived = 0
        `
        const params: unknown[] = []
        if (filters) {
          if (filters.status) {
            query += ' AND c.status = ?'
            params.push(filters.status)
          }
          if (filters.property_id) {
            query += ' AND c.property_id = ?'
            params.push(filters.property_id)
          }
          if (filters.tenant_id) {
            query += ' AND c.tenant_id = ?'
            params.push(filters.tenant_id)
          }
        }
        query += ' ORDER BY c.start_date DESC'
        return db.prepare(query).all(...params)
      } catch (error) {
        if (isDev) console.error('Error listing contracts:', error)
        throw new Error('FAILED_TO_LIST_CONTRACTS')
      }
    }
  )

  ipcMain.handle('contracts:get', async (_, id: number) => {
    try {
      return db
        .prepare(
          `SELECT c.*, p.name AS property_name, p.code AS property_code,
                  t.fullname AS tenant_fullname, t.code AS tenant_code
           FROM contracts c
           JOIN properties p ON c.property_id = p.id
           JOIN tenants t ON c.tenant_id = t.id
           WHERE c.id = ? AND c.is_archived = 0`
        )
        .get(id)
    } catch (error) {
      if (isDev) console.error('Error getting contract:', error)
      throw new Error('FAILED_TO_GET_CONTRACT')
    }
  })

  // Return the full escalation schedule + history for a contract (detail view)
  ipcMain.handle('contracts:getDetail', async (_, id: number) => {
    try {
      const contract = db
        .prepare(
          `SELECT c.*, p.name AS property_name, p.code AS property_code,
                  t.fullname AS tenant_fullname, t.code AS tenant_code
           FROM contracts c
           JOIN properties p ON c.property_id = p.id
           JOIN tenants t ON c.tenant_id = t.id
           WHERE c.id = ?`
        )
        .get(id)
      const schedule = db
        .prepare(
          'SELECT * FROM rent_escalation_schedule WHERE contract_id = ? ORDER BY year_number'
        )
        .all(id)
      const history = db
        .prepare('SELECT * FROM contract_history WHERE contract_id = ? ORDER BY changed_at DESC')
        .all(id)
      return { contract, schedule, history }
    } catch (error) {
      if (isDev) console.error('Error getting contract detail:', error)
      throw new Error('FAILED_TO_GET_CONTRACT_DETAIL')
    }
  })

  ipcMain.handle('contracts:create', async (_, data: unknown) => {
    try {
      const v = contractCreateSchema.parse(data)
      if (new Date(v.end_date) <= new Date(v.start_date))
        throw new Error('CONTRACT_END_DATE_INVALID')
      if (v.status === 'active' && checkOverlap(v.property_id, v.start_date, v.end_date)) {
        throw new Error('CONTRACT_OVERLAPS')
      }
      if (db.prepare('SELECT 1 FROM contracts WHERE contract_number = ?').get(v.contract_number)) {
        throw new Error('CONTRACT_NUMBER_DUPLICATE')
      }

      let insertedId = 0
      db.transaction(() => {
        const res = db
          .prepare(
            `INSERT INTO contracts (
               contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency,
               payment_frequency, security_deposit, status, contract_term_years,
               has_variable_escalation, annual_increase_percent, payment_method, notes
             ) VALUES (
               @contract_number, @property_id, @tenant_id, @start_date, @end_date, @rent_amount, @currency,
               @payment_frequency, @security_deposit, @status, @contract_term_years,
               @has_variable_escalation, @annual_increase_percent, @payment_method, @notes
             )`
          )
          .run(v)
        insertedId = Number(res.lastInsertRowid)
        logHistory(insertedId, 'created', null)
        syncPropertyStatus(v.property_id)
      })()
      return { id: insertedId, ...v }
    } catch (error: unknown) {
      if (isDev) console.error('Error creating contract:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  ipcMain.handle('contracts:update', async (_, data: unknown) => {
    try {
      const v = contractUpdateSchema.parse(data)
      if (new Date(v.end_date) <= new Date(v.start_date))
        throw new Error('CONTRACT_END_DATE_INVALID')
      if (v.status === 'active' && checkOverlap(v.property_id, v.start_date, v.end_date, v.id)) {
        throw new Error('CONTRACT_OVERLAPS')
      }
      if (
        db
          .prepare('SELECT 1 FROM contracts WHERE contract_number = ? AND id != ?')
          .get(v.contract_number, v.id)
      ) {
        throw new Error('CONTRACT_NUMBER_DUPLICATE')
      }

      const old = db.prepare('SELECT * FROM contracts WHERE id = ?').get(v.id) as
        Record<string, unknown> | undefined
      if (!old) throw new Error('CONTRACT_NOT_FOUND')

      db.transaction(() => {
        db.prepare(
          `UPDATE contracts SET
             contract_number = @contract_number, property_id = @property_id, tenant_id = @tenant_id,
             start_date = @start_date, end_date = @end_date, rent_amount = @rent_amount, currency = @currency,
             payment_frequency = @payment_frequency, security_deposit = @security_deposit, status = @status,
             contract_term_years = @contract_term_years, has_variable_escalation = @has_variable_escalation,
             annual_increase_percent = @annual_increase_percent, payment_method = @payment_method, notes = @notes,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = @id`
        ).run(v)
        logHistory(v.id, 'amended', old)
        syncPropertyStatus(v.property_id)
        const oldProp = old.property_id as number
        if (oldProp !== v.property_id) syncPropertyStatus(oldProp)
      })()
      return v
    } catch (error: unknown) {
      if (isDev) console.error('Error updating contract:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  // Replace a contract's multi-year escalation schedule (FR-CON-09..13)
  ipcMain.handle('contracts:setEscalation', async (_, data: unknown) => {
    try {
      const v = escalationSetSchema.parse(data)
      const contract = db
        .prepare('SELECT start_date FROM contracts WHERE id = ?')
        .get(v.contract_id) as { start_date: string } | undefined
      if (!contract) throw new Error('CONTRACT_NOT_FOUND')

      validateEscalationSchedule(contract.start_date, v.schedule as EscalationYearInput[])

      db.transaction(() => {
        persistSchedule(db, v.contract_id, v.schedule as EscalationYearInput[])
        // Flip the contract to variable-escalation mode + set the term length (BR-16)
        db.prepare(
          `UPDATE contracts SET has_variable_escalation = 1,
             contract_term_years = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(v.schedule.length, v.contract_id)
        logHistory(v.contract_id, 'amended', null, 'set escalation schedule')
      })()
      return { success: true, yearCount: v.schedule.length }
    } catch (error: unknown) {
      if (isDev) console.error('Error setting escalation:', error)
      if (error instanceof EscalationValidationError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  ipcMain.handle('contracts:terminate', async (_, payload: unknown) => {
    try {
      const { id, reason } = z
        .object({ id: z.number().int().positive(), reason: z.string().optional() })
        .parse(payload)
      const old = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id) as
        Record<string, unknown> | undefined
      if (!old) throw new Error('CONTRACT_NOT_FOUND')

      db.transaction(() => {
        // INTENT: migration 014 replaced 'terminated' with 'cancelled' in the enum; the
        //         previous 'terminated' write here would violate the CHECK constraint.
        db.prepare(
          `UPDATE contracts SET status = 'cancelled', cancellation_reason = ?,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(reason ?? null, id)
        logHistory(id, 'cancelled', old, reason ?? undefined)
        syncPropertyStatus(old.property_id as number)
      })()
      return { success: true }
    } catch (error) {
      if (isDev) console.error('Error terminating contract:', error)
      throw new Error('FAILED_TO_TERMINATE_CONTRACT')
    }
  })

  /**
   * INTENT: Renew an existing contract in place (FR-CON-04, FR-CON-13; SRS §11.3 / §11.3b).
   * CONSTRAINT: One atomic transaction — contract UPDATE + schedule replacement + history
   *             snapshot + property status sync all succeed together or all roll back.
   * DECISION: Renewal updates start_date to the renewal date so the escalation validator's
   *           BR-17 ("year-1 date must equal contract start") holds without modification.
   *           The full prior state (contract row + schedule) is snapshotted into
   *           contract_history.previous_values_json with action_type='renewed' (BR-07).
   * CAVEAT: Eligibility is status IN ('active','expired'). 'draft' / 'cancelled' / 'renewing'
   *         cannot be renewed (D4).
   */
  ipcMain.handle('contracts:renew', async (_, data: unknown) => {
    try {
      const v = contractRenewSchema.parse(data)

      if (new Date(v.new_end_date) <= new Date(v.new_start_date)) {
        throw new Error('RENEWAL_END_BEFORE_START')
      }

      const old = db
        .prepare('SELECT * FROM contracts WHERE id = ? AND is_archived = 0')
        .get(v.contract_id) as Record<string, unknown> | undefined
      if (!old) throw new Error('CONTRACT_NOT_FOUND')

      if (old.status !== 'active' && old.status !== 'expired') {
        throw new Error('CONTRACT_NOT_RENEWABLE')
      }

      // Variable escalation: validate the schedule against BR-17 using the NEW start date.
      if (v.has_variable_escalation === 1) {
        if (!v.schedule || v.schedule.length < 2) {
          throw new Error('SCHEDULE_TOO_SHORT')
        }
        validateEscalationSchedule(v.new_start_date, v.schedule as EscalationYearInput[])
      }

      const priorSchedule = db
        .prepare(
          'SELECT * FROM rent_escalation_schedule WHERE contract_id = ? ORDER BY year_number'
        )
        .all(v.contract_id) as unknown[]

      db.transaction(() => {
        db.prepare(
          `UPDATE contracts SET
             start_date = @new_start_date, end_date = @new_end_date,
             rent_amount = @rent_amount, security_deposit = @security_deposit,
             has_variable_escalation = @has_variable_escalation,
             contract_term_years = @contract_term_years,
             annual_increase_percent = @annual_increase_percent,
             status = 'active', cancellation_reason = NULL,
             notes = @notes, updated_at = CURRENT_TIMESTAMP
           WHERE id = @contract_id`
        ).run({
          contract_id: v.contract_id,
          new_start_date: v.new_start_date,
          new_end_date: v.new_end_date,
          rent_amount: v.rent_amount,
          security_deposit: v.security_deposit,
          has_variable_escalation: v.has_variable_escalation,
          contract_term_years: v.contract_term_years,
          annual_increase_percent: v.annual_increase_percent ?? null,
          notes: v.notes ?? null
        })

        if (v.has_variable_escalation === 1 && v.schedule) {
          persistSchedule(db, v.contract_id, v.schedule as EscalationYearInput[])
        } else if (priorSchedule.length > 0) {
          // Clear stale schedule when renewing into flat mode (or staying flat with a prior variable history).
          db.prepare('DELETE FROM rent_escalation_schedule WHERE contract_id = ?').run(
            v.contract_id
          )
        }

        logHistory(
          v.contract_id,
          'renewed',
          { contract: old, schedule: priorSchedule },
          `renewed: ${v.new_start_date} → ${v.new_end_date}`
        )
        syncPropertyStatus(old.property_id as number)
      })()
      return { success: true, id: v.contract_id }
    } catch (error: unknown) {
      if (isDev) console.error('Error renewing contract:', error)
      if (error instanceof EscalationValidationError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  ipcMain.handle('contracts:delete', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      const old = db.prepare('SELECT property_id FROM contracts WHERE id = ?').get(id) as
        { property_id: number } | undefined
      if (!old) throw new Error('CONTRACT_NOT_FOUND')
      db.transaction(() => {
        db.prepare(
          'UPDATE contracts SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(id)
        syncPropertyStatus(old.property_id)
      })()
      return { success: true }
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof Error && error.message === 'CONTRACT_NOT_FOUND') throw error
      if (isDev) console.error('Error deleting contract:', error)
      throw new Error('FAILED_TO_DELETE_CONTRACT')
    }
  })

  /**
   * FR-INC-02: Update deposit status (held → returned | partially_forfeited | forfeited).
   * CONSTRAINT: Atomic transaction — updates deposit_status + creates payment + ledger entry.
   * DECISION: Return creates a refund payment (negative amount) for returned/forfeited deposits.
   *           Partially forfeited allows a custom amount (refund the difference, forfeit the rest).
   */
  ipcMain.handle('contracts:updateDepositStatus', async (_, data: unknown) => {
    try {
      const { contract_id, new_status, refund_amount, forfeit_amount, notes } = z
        .object({
          contract_id: z.number().int().positive(),
          new_status: z.enum(['returned', 'partially_forfeited', 'forfeited']),
          refund_amount: z.number().min(0).optional(),
          forfeit_amount: z.number().min(0).optional(),
          notes: z.string().optional().nullable()
        })
        .parse(data)

      const contract = db
        .prepare(
          `SELECT c.*, p.currency AS property_currency
           FROM contracts c JOIN properties p ON c.property_id = p.id
           WHERE c.id = ?`
        )
        .get(contract_id) as
        | {
            id: number
            security_deposit: number
            deposit_status: string | null
            property_id: number
            property_currency: string
            tenant_id: number | null
            status: string
          }
        | undefined

      if (!contract) throw new Error('CONTRACT_NOT_FOUND')
      if (contract.deposit_status !== 'held') {
        throw new Error('DEPOSIT_NOT_HELD')
      }
      if (contract.security_deposit <= 0) {
        throw new Error('NO_DEPOSIT_TO_PROCESS')
      }

      // Validate amounts for partial forfeiture
      if (new_status === 'partially_forfeited') {
        if (refund_amount == null || forfeit_amount == null) {
          throw new Error('PARTIAL_FORFEIT_REQUIRES_AMOUNTS')
        }
        if (Math.abs(refund_amount + forfeit_amount - contract.security_deposit) > 0.01) {
          throw new Error('AMOUNTS_MUST_SUM_TO_DEPOSIT')
        }
      }

      db.transaction(() => {
        // Update deposit_status on the contract
        db.prepare(
          `UPDATE contracts SET deposit_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(new_status, contract_id)

        // Create refund payment(s) via ledger
        if (new_status === 'returned' || new_status === 'partially_forfeited') {
          const refundAmt = new_status === 'returned' ? contract.security_deposit : refund_amount!
          if (refundAmt > 0) {
            createPayment(db, {
              contract_id,
              property_id: contract.property_id,
              tenant_id: contract.tenant_id,
              payment_type: 'deposit',
              payment_date: new Date().toISOString().slice(0, 10),
              amount: refundAmt,
              currency: contract.property_currency,
              property_currency: contract.property_currency,
              notes: notes ?? `Deposit ${new_status}`
            })
          }
        }
        if (new_status === 'partially_forfeited' && forfeit_amount! > 0) {
          // Forfeited portion goes as income
          appendLedgerEntry(db, {
            propertyId: contract.property_id,
            entryType: 'income',
            referenceType: 'manual',
            referenceId: contract_id,
            debit: forfeit_amount!,
            currency: contract.property_currency,
            entryDate: new Date().toISOString().slice(0, 10),
            description: `[deposit_forfeiture] ${notes ?? 'Deposit forfeited'}`
          })
        }

        logHistory(contract_id, 'amended', null, `deposit ${new_status}`)
      })()

      return { success: true }
    } catch (error: unknown) {
      if (isDev) console.error('Error updating deposit status:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })
}
