import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  validateEscalationSchedule,
  persistSchedule,
  type EscalationYearInput,
  EscalationValidationError
} from '../db/contractEscalation'
import { db } from '../db/database'

/**
 * INTENT: IPC handlers for the contracts domain (renamed from leases) + multi-year escalation.
 * CONSTRAINT: All writes that touch escalation or status changes are atomic (db.transaction)
 *             and log to contract_history (BR-07). Channels use the domain:verb convention.
 */

const contractCreateSchema = z.object({
  contract_number: z.string().min(2).max(50),
  property_id: z.number().int().positive(),
  tenant_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rent_amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual']).default('monthly'),
  security_deposit: z.number().nonnegative().default(0.0),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).default('draft'),
  contract_term_years: z.number().int().min(1).max(20).default(1),
  has_variable_escalation: z.number().int().min(0).max(1).default(0),
  annual_increase_percent: z.number().min(0).max(100).optional().nullable(),
  payment_method: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
})

const contractUpdateSchema = contractCreateSchema.extend({
  id: z.number().int().positive()
})

const escalationSetSchema = z.object({
  contract_id: z.number().int().positive(),
  schedule: z
    .array(
      z.object({
        year_number: z.number().int().positive(),
        effective_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rent_amount: z.number().positive(),
        increase_percent_applied: z.number().min(0).max(100).optional().nullable(),
        notes: z.string().optional().nullable()
      })
    )
    .min(1)
})

// Check for an active overlapping contract on the same property
function checkOverlap(
  propertyId: number,
  startDate: string,
  endDate: string,
  excludeId?: number
): boolean {
  let query = `
    SELECT 1 FROM contracts
    WHERE property_id = ? AND status = 'active' AND is_archived = 0
      AND NOT (end_date < ? OR start_date > ?)
  `
  const params: unknown[] = [propertyId, startDate, endDate]
  if (excludeId) {
    query += ' AND id != ?'
    params.push(excludeId)
  }
  return !!db.prepare(query).get(...params)
}

// Sync property status based on whether it has any active contract
function syncPropertyStatus(propertyId: number): void {
  const active = db
    .prepare(
      `SELECT 1 FROM contracts WHERE property_id = ? AND status = 'active' AND is_archived = 0`
    )
    .get(propertyId)
  db.prepare('UPDATE properties SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    active ? 'rented' : 'vacant',
    propertyId
  )
}

// Append a contract_history row (snapshot the current row before a change)
function logHistory(
  contractId: number,
  actionType: 'created' | 'renewed' | 'amended' | 'cancelled',
  previousValues: Record<string, unknown> | null,
  note?: string
): void {
  db.prepare(
    `INSERT INTO contract_history (contract_id, action_type, previous_values_json, changed_by_note)
     VALUES (?, ?, ?, ?)`
  ).run(
    contractId,
    actionType,
    previousValues ? JSON.stringify(previousValues) : null,
    note ?? null
  )
}

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
        console.error('Error listing contracts:', error)
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
      console.error('Error getting contract:', error)
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
      console.error('Error getting contract detail:', error)
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
      console.error('Error creating contract:', error)
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
      console.error('Error updating contract:', error)
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
      console.error('Error setting escalation:', error)
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
        db.prepare(
          `UPDATE contracts SET status = 'terminated', cancellation_reason = ?,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(reason ?? null, id)
        logHistory(id, 'cancelled', old, reason ?? undefined)
        syncPropertyStatus(old.property_id as number)
      })()
      return { success: true }
    } catch (error) {
      console.error('Error terminating contract:', error)
      throw new Error('FAILED_TO_TERMINATE_CONTRACT')
    }
  })

  ipcMain.handle('contracts:delete', async (_, id: number) => {
    try {
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
      console.error('Error deleting contract:', error)
      throw new Error('FAILED_TO_DELETE_CONTRACT')
    }
  })
}
