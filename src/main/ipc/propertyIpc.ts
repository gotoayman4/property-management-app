import { ipcMain } from 'electron'
import { db } from '../db/database'
import { z } from 'zod'

// Define validation schemas for property creation/update
const propertyCreateSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9-]+$/),
  name: z.string().min(3).max(100),
  type: z.enum(['apartment', 'shop']),
  country: z.string().length(2),
  currency: z.string().min(3).max(3),
  address: z.string().optional().nullable(),
  area_sqm: z.number().positive().optional().nullable(),
  status: z.enum(['vacant', 'rented', 'maintenance']).default('vacant'),
  monthly_rent_default: z.number().nonnegative().default(0.0),
  notes: z.string().optional().nullable()
})

const propertyUpdateSchema = propertyCreateSchema.extend({
  id: z.number().int().positive()
})

const settingsUpdateSchema = z.object({
  app_language: z.enum(['ar', 'en']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  font_size: z.enum(['small', 'medium', 'large']).optional(),
  reporting_currency: z.string().min(3).max(3).optional(),
  default_payment_method: z.enum(['cash', 'bank_transfer', 'cheque', 'other']).optional(),
  backup_path: z.string().optional(),
  date_format: z.string().optional(),
  reminder_days_before_due: z.number().int().min(0).max(90).optional(),
  reminder_days_before_contract_end: z.number().int().min(0).max(365).optional(),
  reminder_days_before_document_expiry: z.number().int().min(0).max(365).optional(),
  reminder_days_before_recurring_expense: z.number().int().min(0).max(30).optional()
})

export function registerPropertyIpcHandlers(): void {
  // List active countries
  ipcMain.handle('countries:list', async () => {
    try {
      return db.prepare('SELECT * FROM countries WHERE is_active = 1').all()
    } catch (error) {
      console.error('Error fetching countries:', error)
      throw new Error('FAILED_TO_FETCH_COUNTRIES')
    }
  })

  // List properties with filters
  ipcMain.handle(
    'properties:list',
    async (_, filters?: { type?: string; status?: string; country?: string; search?: string }) => {
      try {
        let query = 'SELECT * FROM properties WHERE is_archived = 0'
        const params: unknown[] = []

        if (filters) {
          if (filters.type) {
            query += ' AND type = ?'
            params.push(filters.type)
          }
          if (filters.status) {
            query += ' AND status = ?'
            params.push(filters.status)
          }
          if (filters.country) {
            query += ' AND country = ?'
            params.push(filters.country)
          }
          if (filters.search) {
            query += ' AND (name LIKE ? OR code LIKE ?)'
            params.push(`%${filters.search}%`, `%${filters.search}%`)
          }
        }

        query += ' ORDER BY created_at DESC'
        return db.prepare(query).all(...params)
      } catch (error) {
        console.error('Error listing properties:', error)
        throw new Error('FAILED_TO_LIST_PROPERTIES')
      }
    }
  )

  // Get a single property by ID
  ipcMain.handle('properties:get', async (_, id: number) => {
    try {
      return db.prepare('SELECT * FROM properties WHERE id = ? AND is_archived = 0').get(id)
    } catch (error) {
      console.error('Error getting property:', error)
      throw new Error('FAILED_TO_GET_PROPERTY')
    }
  })

  // Create a new property
  ipcMain.handle('properties:create', async (_, data: unknown) => {
    try {
      const validatedData = propertyCreateSchema.parse(data)

      // Check if code is unique
      const existing = db.prepare('SELECT 1 FROM properties WHERE code = ?').get(validatedData.code)
      if (existing) {
        throw new Error('PROPERTY_CODE_DUPLICATE')
      }

      const stmt = db.prepare(`
        INSERT INTO properties (
          code, name, type, country, currency, address, area_sqm, status, monthly_rent_default, notes
        ) VALUES (
          @code, @name, @type, @country, @currency, @address, @area_sqm, @status, @monthly_rent_default, @notes
        )
      `)

      const result = stmt.run(validatedData)
      return { id: result.lastInsertRowid, ...validatedData }
    } catch (error: unknown) {
      console.error('Error creating property:', error)
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw error
    }
  })

  // Update an existing property
  ipcMain.handle('properties:update', async (_, data: unknown) => {
    try {
      const validatedData = propertyUpdateSchema.parse(data)

      // Check if code is unique for other properties
      const existing = db
        .prepare('SELECT 1 FROM properties WHERE code = ? AND id != ?')
        .get(validatedData.code, validatedData.id)
      if (existing) {
        throw new Error('PROPERTY_CODE_DUPLICATE')
      }

      const stmt = db.prepare(`
        UPDATE properties SET
          code = @code,
          name = @name,
          type = @type,
          country = @country,
          currency = @currency,
          address = @address,
          area_sqm = @area_sqm,
          status = @status,
          monthly_rent_default = @monthly_rent_default,
          notes = @notes,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id AND is_archived = 0
      `)

      stmt.run(validatedData)
      return validatedData
    } catch (error: unknown) {
      console.error('Error updating property:', error)
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw error
    }
  })

  // Archive (soft delete) a property
  ipcMain.handle('properties:delete', async (_, id: number) => {
    try {
      // Check if there are active contracts or transactions (we will implement checks as we build contracts)
      // For now, allow soft archiving.
      const stmt = db.prepare(
        'UPDATE properties SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      stmt.run(id)
      return { success: true }
    } catch (error) {
      console.error('Error deleting property:', error)
      throw new Error('FAILED_TO_DELETE_PROPERTY')
    }
  })

  // Get application settings (singleton)
  ipcMain.handle('settings:get', async () => {
    try {
      return db.prepare('SELECT * FROM settings WHERE id = 1').get()
    } catch (error) {
      console.error('Error fetching settings:', error)
      throw new Error('FAILED_TO_FETCH_SETTINGS')
    }
  })

  // Update application settings
  ipcMain.handle('settings:update', async (_, data: unknown) => {
    try {
      const validatedData = settingsUpdateSchema.parse(data)

      // Build dynamic UPDATE query
      const keys = Object.keys(validatedData)
      if (keys.length === 0) return { success: true }

      const assignments = keys.map((key) => `${key} = @${key}`).join(', ')
      const stmt = db.prepare(`UPDATE settings SET ${assignments} WHERE id = 1`)
      stmt.run(validatedData)

      return { success: true, settings: db.prepare('SELECT * FROM settings WHERE id = 1').get() }
    } catch (error) {
      console.error('Error updating settings:', error)
      throw new Error('FAILED_TO_UPDATE_SETTINGS')
    }
  })
}
