import { ipcMain } from 'electron'
import { z } from 'zod'
import { getNextPropertyCode } from '../db/codeGenerator'
import { db } from '../db/database'
import { logger } from '../utils/logger'

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
  reminder_days_before_recurring_expense: z.number().int().min(0).max(30).optional(),
  require_auth: z.number().int().min(0).max(1).optional(),
  default_country: z.string().length(2).nullable().optional(),
  max_backup_count: z.number().int().min(1).max(100).optional(),
  receipt_prefix: z.string().min(1).max(20).optional(),
  receipt_starting_sequence: z.number().int().min(1).max(999999).optional(),
  backup_enabled: z.number().int().min(0).max(1).optional(),
  backup_frequency: z.enum(['daily', 'weekly']).optional(),
  backup_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  full_backup_enabled: z.number().int().min(0).max(1).optional(),
  full_backup_frequency: z.enum(['monthly', 'weekly']).optional(),
  full_backup_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  company_name: z.string().max(200).nullable().optional(),
  company_logo: z.string().nullable().optional(),
  company_signature: z.string().max(500_000).nullable().optional(),
  company_address: z.string().max(500).nullable().optional(),
  company_phone: z.string().max(50).nullable().optional(),
  company_email: z.string().max(200).nullable().optional(),
  dashboard_hidden_widgets: z.string().optional(),
  auto_update_check: z.number().int().min(0).max(1).optional(),
  auto_update_download: z.number().int().min(0).max(1).optional()
})

const countryCreateSchema = z.object({
  code: z.string().length(2).toUpperCase(),
  name: z.string().min(1).max(100),
  default_currency: z.string().length(3).toUpperCase()
})

const countryUpdateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100).optional(),
  default_currency: z.string().length(3).toUpperCase().optional()
})

export function registerPropertyIpcHandlers(): void {
  // Generate next sequential property code for a given country + type
  ipcMain.handle(
    'properties:generateCode',
    async (_, params: { country: string; type: string }) => {
      try {
        return getNextPropertyCode(db, params.country, params.type as 'apartment' | 'shop')
      } catch (error) {
        logger.error('Error generating property code', error)
        throw new Error('FAILED_TO_GENERATE_CODE')
      }
    }
  )

  // List active countries
  ipcMain.handle('countries:list', async () => {
    try {
      return db.prepare('SELECT * FROM countries WHERE is_active = 1 ORDER BY name').all()
    } catch (error) {
      logger.error('Error fetching countries', error)
      throw new Error('FAILED_TO_FETCH_COUNTRIES')
    }
  })

  // List only countries that have at least one non-archived property (dashboard tabs)
  ipcMain.handle('countries:listWithProperties', async () => {
    try {
      return db
        .prepare(
          `SELECT DISTINCT c.* FROM countries c
           INNER JOIN properties p ON p.country = c.code
           WHERE c.is_active = 1 AND p.is_archived = 0
           ORDER BY c.name`
        )
        .all()
    } catch (error) {
      logger.error('Error fetching countries with properties', error)
      throw new Error('FAILED_TO_FETCH_COUNTRIES')
    }
  })

  // List all countries (including inactive) — used by CountryManagerDialog
  ipcMain.handle('countries:listAll', async () => {
    try {
      return db.prepare('SELECT * FROM countries ORDER BY is_active DESC, name').all()
    } catch (error) {
      logger.error('Error fetching all countries', error)
      throw new Error('FAILED_TO_FETCH_COUNTRIES')
    }
  })

  // Create a new country
  ipcMain.handle('countries:create', async (_, data: unknown) => {
    try {
      const validated = countryCreateSchema.parse(data)
      const existing = db.prepare('SELECT 1 FROM countries WHERE code = ?').get(validated.code)
      if (existing) {
        throw new Error('COUNTRY_CODE_DUPLICATE')
      }
      const stmt = db.prepare(
        'INSERT INTO countries (code, name, default_currency, is_active) VALUES (@code, @name, @default_currency, 1)'
      )
      return stmt.run(validated)
    } catch (error: unknown) {
      logger.error('Error creating country', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  // Update a country (name, default_currency)
  ipcMain.handle('countries:update', async (_, data: unknown) => {
    try {
      const validated = countryUpdateSchema.parse(data)
      const keys = Object.keys(validated).filter((k) => k !== 'id')
      if (keys.length === 0) return { success: true }
      const assignments = keys.map((key) => `${key} = @${key}`).join(', ')
      const stmt = db.prepare(`UPDATE countries SET ${assignments} WHERE id = @id`)
      stmt.run(validated)
      return { success: true }
    } catch (error: unknown) {
      logger.error('Error updating country', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  // Soft-delete a country (set is_active = 0). Blocks if properties reference it.
  ipcMain.handle('countries:delete', async (_, code: string) => {
    try {
      const count = (
        db.prepare('SELECT COUNT(*) AS cnt FROM properties WHERE country = ?').get(code) as {
          cnt: number
        }
      ).cnt
      if (count > 0) {
        throw new Error('COUNTRY_IN_USE')
      }
      db.prepare('UPDATE countries SET is_active = 0 WHERE code = ?').run(code)
      return { success: true }
    } catch (error) {
      logger.error('Error deactivating country', error)
      throw error
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
        logger.error('Error listing properties', error)
        throw new Error('FAILED_TO_LIST_PROPERTIES')
      }
    }
  )

  // Get a single property by ID
  ipcMain.handle('properties:get', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      return db.prepare('SELECT * FROM properties WHERE id = ? AND is_archived = 0').get(id)
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      logger.error('Error getting property', error)
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
      logger.error('Error creating property', error)
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
      logger.error('Error updating property', error)
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw error
    }
  })

  // Archive (soft delete) a property
  ipcMain.handle('properties:delete', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      // FR-PROP-04 / §8.3: Block archive if the property still has an active contract.
      const activeContract = db
        .prepare(
          `SELECT 1 FROM contracts
           WHERE property_id = ? AND status = 'active' AND is_archived = 0`
        )
        .get(id)
      if (activeContract) {
        throw new Error('PROPERTY_HAS_ACTIVE_CONTRACT')
      }

      // Secondary guard: block if any non-archived contract exists at all (§8.3 audit trail).
      const anyContract = db
        .prepare(`SELECT 1 FROM contracts WHERE property_id = ? AND is_archived = 0`)
        .get(id)
      if (anyContract) {
        throw new Error('PROPERTY_HAS_CONTRACTS')
      }

      db.prepare(
        'UPDATE properties SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(id)
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (
        error instanceof Error &&
        (error.message === 'PROPERTY_HAS_ACTIVE_CONTRACT' ||
          error.message === 'PROPERTY_HAS_CONTRACTS')
      ) {
        throw error
      }
      logger.error('Error deleting property', error)
      throw new Error('FAILED_TO_DELETE_PROPERTY')
    }
  })

  // Get application settings (singleton)
  ipcMain.handle('settings:get', async () => {
    try {
      return db.prepare('SELECT * FROM settings WHERE id = 1').get()
    } catch (error) {
      logger.error('Error fetching settings', error)
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
      logger.error('Error updating settings', error)
      throw new Error('FAILED_TO_UPDATE_SETTINGS')
    }
  })

  // Property profitability — pre-calculated income/expense/net in the main process
  // (architectural mandate: no business logic in renderer components).
  ipcMain.handle(
    'properties:profitability',
    async (
      _,
      payload: unknown
    ): Promise<{
      totalIncome: number
      totalExpenses: number
      netProfit: number
      paymentCount: number
      expenseCount: number
    }> => {
      const { property_id } = payload as { property_id: number }
      if (!property_id || typeof property_id !== 'number') {
        throw new Error('INVALID_INPUT')
      }

      try {
        const incomeRow = db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
               FROM payments
              WHERE property_id = ? AND is_voided = 0`
          )
          .get(property_id) as { total: number; cnt: number }

        const expenseRow = db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
               FROM expenses
              WHERE property_id = ? AND is_voided = 0`
          )
          .get(property_id) as { total: number; cnt: number }

        const totalIncome = incomeRow.total
        const totalExpenses = expenseRow.total

        return {
          totalIncome,
          totalExpenses,
          netProfit: totalIncome - totalExpenses,
          paymentCount: incomeRow.cnt,
          expenseCount: expenseRow.cnt
        }
      } catch (err) {
        logger.error('propertyIpc] profitability error', err)
        throw new Error('FAILED_TO_LOAD_PROFITABILITY')
      }
    }
  )
}
