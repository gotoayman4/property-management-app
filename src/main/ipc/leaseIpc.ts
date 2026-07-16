import { ipcMain } from 'electron'
import { db } from '../db/database'
import { z } from 'zod'

const leaseCreateSchema = z.object({
  contract_number: z.string().min(2).max(50),
  property_id: z.number().int().positive(),
  tenant_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  rent_amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual']).default('monthly'),
  security_deposit: z.number().nonnegative().default(0.0),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).default('draft'),
  notes: z.string().optional().nullable()
})

const leaseUpdateSchema = leaseCreateSchema.extend({
  id: z.number().int().positive()
})

// Helper to check active overlapping leases
function checkLeaseOverlap(
  propertyId: number,
  startDate: string,
  endDate: string,
  excludeLeaseId?: number
): boolean {
  let query = `
    SELECT 1 FROM leases 
    WHERE property_id = ? 
      AND status = 'active' 
      AND is_archived = 0 
      AND NOT (end_date < ? OR start_date > ?)
  `
  const params: unknown[] = [propertyId, startDate, endDate]

  if (excludeLeaseId) {
    query += ' AND id != ?'
    params.push(excludeLeaseId)
  }

  const existing = db.prepare(query).get(...params)
  return !!existing
}

// Helper to sync property status based on active leases
function syncPropertyStatus(propertyId: number): void {
  // Check if there are any active leases for the property
  const activeLease = db
    .prepare(
      `
    SELECT 1 FROM leases 
    WHERE property_id = ? AND status = 'active' AND is_archived = 0
  `
    )
    .get(propertyId)

  const nextStatus = activeLease ? 'rented' : 'vacant'
  db.prepare('UPDATE properties SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    nextStatus,
    propertyId
  )
}

export function registerLeaseIpcHandlers(): void {
  // List leases (joined with properties and tenants)
  ipcMain.handle(
    'leases:list',
    async (_, filters?: { status?: string; property_id?: number; tenant_id?: number }) => {
      try {
        let query = `
        SELECT l.*, 
               p.name as property_name, p.code as property_code,
               t.fullname as tenant_fullname, t.code as tenant_code
        FROM leases l
        JOIN properties p ON l.property_id = p.id
        JOIN tenants t ON l.tenant_id = t.id
        WHERE l.is_archived = 0
      `
        const params: unknown[] = []

        if (filters) {
          if (filters.status) {
            query += ' AND l.status = ?'
            params.push(filters.status)
          }
          if (filters.property_id) {
            query += ' AND l.property_id = ?'
            params.push(filters.property_id)
          }
          if (filters.tenant_id) {
            query += ' AND l.tenant_id = ?'
            params.push(filters.tenant_id)
          }
        }

        query += ' ORDER BY l.start_date DESC'
        return db.prepare(query).all(...params)
      } catch (error) {
        console.error('Error listing leases:', error)
        throw new Error('FAILED_TO_LIST_LEASES')
      }
    }
  )

  // Get lease
  ipcMain.handle('leases:get', async (_, id: number) => {
    try {
      return db
        .prepare(
          `
        SELECT l.*, 
               p.name as property_name, p.code as property_code,
               t.fullname as tenant_fullname, t.code as tenant_code
        FROM leases l
        JOIN properties p ON l.property_id = p.id
        JOIN tenants t ON l.tenant_id = t.id
        WHERE l.id = ? AND l.is_archived = 0
      `
        )
        .get(id)
    } catch (error) {
      console.error('Error getting lease:', error)
      throw new Error('FAILED_TO_GET_LEASE')
    }
  })

  // Create lease
  ipcMain.handle('leases:create', async (_, data: unknown) => {
    try {
      const validatedData = leaseCreateSchema.parse(data)

      // 1. Validate dates
      if (new Date(validatedData.end_date) <= new Date(validatedData.start_date)) {
        throw new Error('LEASE_END_DATE_INVALID')
      }

      // 2. Check overlap if status is active
      if (validatedData.status === 'active') {
        const hasOverlap = checkLeaseOverlap(
          validatedData.property_id,
          validatedData.start_date,
          validatedData.end_date
        )
        if (hasOverlap) {
          throw new Error('LEASE_OVERLAPS')
        }
      }

      // Ensure contract number is unique
      const existing = db
        .prepare('SELECT 1 FROM leases WHERE contract_number = ?')
        .get(validatedData.contract_number)
      if (existing) {
        throw new Error('LEASE_NUMBER_DUPLICATE')
      }

      let insertedId: number | bigint = 0

      // Execute in an atomic transaction
      db.transaction(() => {
        const stmt = db.prepare(`
          INSERT INTO leases (
            contract_number, property_id, tenant_id, start_date, end_date, 
            rent_amount, currency, payment_frequency, security_deposit, status, notes
          ) VALUES (
            @contract_number, @property_id, @tenant_id, @start_date, @end_date,
            @rent_amount, @currency, @payment_frequency, @security_deposit, @status, @notes
          )
        `)
        const result = stmt.run(validatedData)
        insertedId = result.lastInsertRowid

        // Sync property status
        syncPropertyStatus(validatedData.property_id)
      })()

      return { id: insertedId, ...validatedData }
    } catch (error: unknown) {
      console.error('Error creating lease:', error)
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw error
    }
  })

  // Update lease
  ipcMain.handle('leases:update', async (_, data: unknown) => {
    try {
      const validatedData = leaseUpdateSchema.parse(data)

      // 1. Validate dates
      if (new Date(validatedData.end_date) <= new Date(validatedData.start_date)) {
        throw new Error('LEASE_END_DATE_INVALID')
      }

      // 2. Check overlap if status is active
      if (validatedData.status === 'active') {
        const hasOverlap = checkLeaseOverlap(
          validatedData.property_id,
          validatedData.start_date,
          validatedData.end_date,
          validatedData.id
        )
        if (hasOverlap) {
          throw new Error('LEASE_OVERLAPS')
        }
      }

      // Ensure contract number is unique for other leases
      const existing = db
        .prepare('SELECT 1 FROM leases WHERE contract_number = ? AND id != ?')
        .get(validatedData.contract_number, validatedData.id)
      if (existing) {
        throw new Error('LEASE_NUMBER_DUPLICATE')
      }

      const oldLease = db
        .prepare('SELECT property_id FROM leases WHERE id = ?')
        .get(validatedData.id) as { property_id: number } | undefined

      db.transaction(() => {
        const stmt = db.prepare(`
          UPDATE leases SET
            contract_number = @contract_number,
            property_id = @property_id,
            tenant_id = @tenant_id,
            start_date = @start_date,
            end_date = @end_date,
            rent_amount = @rent_amount,
            currency = @currency,
            payment_frequency = @payment_frequency,
            security_deposit = @security_deposit,
            status = @status,
            notes = @notes,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `)
        stmt.run(validatedData)

        // Sync new property
        syncPropertyStatus(validatedData.property_id)

        // Sync old property if it was changed
        if (oldLease && oldLease.property_id !== validatedData.property_id) {
          syncPropertyStatus(oldLease.property_id)
        }
      })()

      return validatedData
    } catch (error: unknown) {
      console.error('Error updating lease:', error)
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw error
    }
  })

  // Terminate lease
  ipcMain.handle('leases:terminate', async (_, id: number) => {
    try {
      const oldLease = db.prepare('SELECT property_id FROM leases WHERE id = ?').get(id) as
        { property_id: number } | undefined
      if (!oldLease) throw new Error('LEASE_NOT_FOUND')

      db.transaction(() => {
        db.prepare(
          "UPDATE leases SET status = 'terminated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(id)
        syncPropertyStatus(oldLease.property_id)
      })()

      return { success: true }
    } catch (error) {
      console.error('Error terminating lease:', error)
      throw new Error('FAILED_TO_TERMINATE_LEASE')
    }
  })

  // Archive (soft delete) lease
  ipcMain.handle('leases:delete', async (_, id: number) => {
    try {
      const oldLease = db.prepare('SELECT property_id FROM leases WHERE id = ?').get(id) as
        { property_id: number } | undefined
      if (!oldLease) throw new Error('LEASE_NOT_FOUND')

      db.transaction(() => {
        db.prepare(
          'UPDATE leases SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(id)
        syncPropertyStatus(oldLease.property_id)
      })()

      return { success: true }
    } catch (error) {
      console.error('Error deleting lease:', error)
      throw new Error('FAILED_TO_DELETE_LEASE')
    }
  })
}
