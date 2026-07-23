import { ipcMain } from 'electron'
import { z } from 'zod'

const isDev = process.env.NODE_ENV !== 'production'
import { getNextTenantCode } from '../db/codeGenerator'
import { db } from '../db/database'

// Define Zod validation schemas for Tenant (SRS §8 + FR-TEN-01)
const tenantCreateSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9-]+$/),
  fullname: z.string().min(3).max(100),
  national_id: z.string().optional().nullable(),
  country_code: z.string().optional().nullable(),
  phone: z.string().min(5).max(20),
  email: z.string().email().optional().nullable().or(z.literal('')),
  type: z.enum(['individual', 'company']).default('individual'),
  company_reg_no: z.string().optional().nullable(),
  representative_name: z.string().optional().nullable(),
  preferred_language: z.enum(['ar', 'tr', 'en']).default('ar'),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  is_active: z.number().int().min(0).max(1).default(1)
})

const tenantUpdateSchema = tenantCreateSchema.extend({
  id: z.number().int().positive()
})

export function registerTenantIpcHandlers(): void {
  // Generate next sequential tenant code for a given type
  ipcMain.handle('tenants:generateCode', async (_, params: { type: string }) => {
    try {
      return getNextTenantCode(db, params.type as 'individual' | 'company')
    } catch (error) {
      if (isDev) console.error('Error generating tenant code:', error)
      throw new Error('FAILED_TO_GENERATE_CODE')
    }
  })

  // List tenants with search filters
  ipcMain.handle(
    'tenants:list',
    async (_, filters?: { search?: string; type?: string; is_active?: number }) => {
      try {
        let query = 'SELECT * FROM tenants WHERE 1=1'
        const params: unknown[] = []

        if (filters) {
          if (filters.type) {
            query += ' AND type = ?'
            params.push(filters.type)
          }
          if (filters.is_active !== undefined) {
            query += ' AND is_active = ?'
            params.push(filters.is_active)
          }
          if (filters.search) {
            // FR-TEN-05: search by name, national ID, phone, or country code
            query +=
              ' AND (fullname LIKE ? OR code LIKE ? OR phone LIKE ? OR national_id LIKE ? OR country_code LIKE ?)'
            params.push(
              `%${filters.search}%`,
              `%${filters.search}%`,
              `%${filters.search}%`,
              `%${filters.search}%`,
              `%${filters.search}%`
            )
          }
        }

        query += ' ORDER BY fullname ASC'
        return db.prepare(query).all(...params)
      } catch (error) {
        if (isDev) console.error('Error listing tenants:', error)
        throw new Error('FAILED_TO_LIST_TENANTS')
      }
    }
  )

  // Get single tenant
  ipcMain.handle('tenants:get', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id)
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (isDev) console.error('Error getting tenant:', error)
      throw new Error('FAILED_TO_GET_TENANT')
    }
  })

  // Create new tenant
  ipcMain.handle('tenants:create', async (_, data: unknown) => {
    try {
      const validatedData = tenantCreateSchema.parse(data)

      // Ensure code is unique
      const existing = db.prepare('SELECT 1 FROM tenants WHERE code = ?').get(validatedData.code)
      if (existing) {
        throw new Error('TENANT_CODE_DUPLICATE')
      }

      // Ensure national_id is unique if provided
      if (validatedData.national_id) {
        const existingNid = db
          .prepare('SELECT 1 FROM tenants WHERE national_id = ?')
          .get(validatedData.national_id)
        if (existingNid) {
          throw new Error('NATIONAL_ID_DUPLICATE')
        }
      }

      const stmt = db.prepare(`
        INSERT INTO tenants (
          code, fullname, national_id, country_code, phone, email, type, company_reg_no, representative_name,
          preferred_language, emergency_contact_name, emergency_contact_phone, address, notes, is_active
        ) VALUES (
          @code, @fullname, @national_id, @country_code, @phone, @email, @type, @company_reg_no, @representative_name,
          @preferred_language, @emergency_contact_name, @emergency_contact_phone, @address, @notes, @is_active
        )
      `)

      const result = stmt.run(validatedData)
      return { id: result.lastInsertRowid, ...validatedData }
    } catch (error: unknown) {
      if (isDev) console.error('Error creating tenant:', error)
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw error
    }
  })

  // Update tenant
  ipcMain.handle('tenants:update', async (_, data: unknown) => {
    try {
      const validatedData = tenantUpdateSchema.parse(data)

      // Ensure code is unique for other tenants
      const existing = db
        .prepare('SELECT 1 FROM tenants WHERE code = ? AND id != ?')
        .get(validatedData.code, validatedData.id)
      if (existing) {
        throw new Error('TENANT_CODE_DUPLICATE')
      }

      // Ensure national_id is unique if provided (exclude self)
      if (validatedData.national_id) {
        const existingNid = db
          .prepare('SELECT 1 FROM tenants WHERE national_id = ? AND id != ?')
          .get(validatedData.national_id, validatedData.id)
        if (existingNid) {
          throw new Error('NATIONAL_ID_DUPLICATE')
        }
      }

      const stmt = db.prepare(`
        UPDATE tenants SET
          code = @code,
          fullname = @fullname,
          national_id = @national_id,
          country_code = @country_code,
          phone = @phone,
          email = @email,
          type = @type,
          company_reg_no = @company_reg_no,
          representative_name = @representative_name,
          preferred_language = @preferred_language,
          emergency_contact_name = @emergency_contact_name,
          emergency_contact_phone = @emergency_contact_phone,
          address = @address,
          notes = @notes,
          is_active = @is_active,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `)

      stmt.run(validatedData)
      return validatedData
    } catch (error: unknown) {
      if (isDev) console.error('Error updating tenant:', error)
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw error
    }
  })

  // Deactivate (soft delete) tenant
  ipcMain.handle('tenants:delete', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      // Guard: block deactivation if tenant has any active non-archived contract.
      const activeContract = db
        .prepare(
          `SELECT 1 FROM contracts WHERE tenant_id = ? AND status = 'active' AND is_archived = 0`
        )
        .get(id)
      if (activeContract) {
        throw new Error('TENANT_HAS_ACTIVE_CONTRACT')
      }

      // Soft deactivation
      const stmt = db.prepare(
        'UPDATE tenants SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      stmt.run(id)
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof Error && error.message === 'TENANT_HAS_ACTIVE_CONTRACT') {
        throw error
      }
      if (isDev) console.error('Error deleting tenant:', error)
      throw new Error('FAILED_TO_DELETE_TENANT')
    }
  })
}
