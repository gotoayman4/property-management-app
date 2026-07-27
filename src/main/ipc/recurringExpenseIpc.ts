/**
 * @file recurringExpenseIpc — Recurring expense template IPC handlers.
 * INTENT: Registers IPC channels for CRUD, preview, confirm, and skip of recurring expenses.
 */
import { ipcMain } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'
import { createExpense, ExpenseError } from '../db/expenseRepository'
import {
  getNextDueDate,
  normalizeFrequency,
  shouldMarkEnded,
  toLocalISODate,
  type RecurringScheduleTemplate
} from '../db/recurringSchedule'
import {
  evaluateRecurringExpenses,
  loadTemplateForSchedule,
  isInstanceActioned,
  insertLogRow,
  advanceTemplateCursor
} from '../services/recurringEvaluator'
import { logger } from '../utils/logger'

export { evaluateRecurringExpenses }

const FREQUENCY_ENUM = z.enum([
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'semi-annual',
  'annual'
])

const templateCreateSchema = z.object({
  property_id: z.number().int().positive().nullable().optional(),
  category_id: z.number().int().positive(),
  name: z.string().min(2).max(150),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  frequency: FREQUENCY_ENUM,
  day_of_month: z.number().int().min(1).max(31).default(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  vendor_name: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable()
})

const templateUpdateSchema = templateCreateSchema.extend({
  id: z.number().int().positive()
})

const templateListFiltersSchema = z
  .object({
    property_id: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
    frequency: FREQUENCY_ENUM.optional()
  })
  .optional()
  .nullable()

const idSchema = z.number().int().positive()

const skipSchema = z.object({
  template_id: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  skip_reason: z.string().min(1).max(500)
})

const confirmSchema = z.object({
  template_id: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive().optional(),
  notes: z.string().max(500).optional().nullable()
})

export function registerRecurringExpenseIpcHandlers(): void {
  ipcMain.handle('recurringExpenses:list', async (_, rawFilters: unknown) => {
    try {
      const filters = rawFilters ? templateListFiltersSchema.parse(rawFilters) : undefined
      let query = `
        SELECT t.*,
               p.name as property_name, p.code as property_code,
               c.name_key as category_name_key
        FROM recurring_expense_templates t
        LEFT JOIN properties p ON t.property_id = p.id
        LEFT JOIN expense_categories c ON t.category_id = c.id
        WHERE 1=1`
      const params: (string | number)[] = []

      if (filters?.property_id !== undefined) {
        query += ' AND t.property_id = ?'
        params.push(filters.property_id)
      }
      if (filters?.is_active !== undefined) {
        query += ' AND t.is_active = ?'
        params.push(filters.is_active ? 1 : 0)
      }
      if (filters?.frequency !== undefined) {
        query += ' AND t.frequency = ?'
        params.push(filters.frequency)
      }

      query += ' ORDER BY t.is_active DESC, t.next_due_date ASC, t.name ASC'
      const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>

      const today = toLocalISODate(new Date())
      return rows.map((row) => {
        const scheduleTpl = loadTemplateForSchedule(row)
        const isEnded = shouldMarkEnded(scheduleTpl, today)
        return {
          ...row,
          is_active: Number(row['is_active']) === 1 && !isEnded,
          is_ended: isEnded
        }
      })
    } catch (err) {
      if (process.env.NODE_ENV !== 'production')
        logger.error('Error listing recurring expenses', err)
      throw new Error('FAILED_TO_LIST_RECURRING_TEMPLATES')
    }
  })

  ipcMain.handle('recurringExpenses:get', async (_, rawId: unknown) => {
    try {
      const id = idSchema.parse(rawId)
      const row = db
        .prepare(
          `SELECT t.*,
                  p.name as property_name, p.code as property_code,
                  c.name_key as category_name_key
           FROM recurring_expense_templates t
           LEFT JOIN properties p ON t.property_id = p.id
           LEFT JOIN expense_categories c ON t.category_id = c.id
           WHERE t.id = ?`
        )
        .get(id) as Record<string, unknown> | undefined

      if (!row) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')

      const today = toLocalISODate(new Date())
      const scheduleTpl = loadTemplateForSchedule(row)
      const isEnded = shouldMarkEnded(scheduleTpl, today)

      return {
        ...row,
        is_active: Number(row['is_active']) === 1 && !isEnded,
        is_ended: isEnded
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'RECURRING_TEMPLATE_NOT_FOUND') {
        throw err
      }
      throw new Error('FAILED_TO_GET_RECURRING_TEMPLATE')
    }
  })

  ipcMain.handle('recurringExpenses:create', async (_, rawData: unknown) => {
    try {
      const data = templateCreateSchema.parse(rawData)

      if (data.property_id !== null) {
        const prop = db
          .prepare('SELECT id FROM properties WHERE id = ? AND is_archived = 0')
          .get(data.property_id)
        if (!prop) throw new Error('PROPERTY_NOT_FOUND')
      }

      const cat = db.prepare('SELECT id FROM expense_categories WHERE id = ?').get(data.category_id)
      if (!cat) throw new Error('CATEGORY_NOT_FOUND')

      const normalizedFreq = normalizeFrequency(data.frequency)
      const initialNextDue = data.start_date

      let templateId = 0
      db.transaction(() => {
        const res = db
          .prepare(
            `INSERT INTO recurring_expense_templates (
               property_id, category_id, name, description, amount, currency, frequency, day_of_month,
               start_date, end_date, next_due_date, vendor_name, notes, is_active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
          )
          .run(
            data.property_id,
            data.category_id,
            data.name,
            data.name,
            data.amount,
            data.currency.toUpperCase(),
            normalizedFreq,
            data.day_of_month,
            data.start_date,
            data.end_date ?? null,
            initialNextDue,
            data.vendor_name ?? null,
            data.notes ?? null
          )

        templateId = Number(res.lastInsertRowid)
      })()

      return { success: true, id: templateId }
    } catch (err) {
      logger.error('Error in recurringExpenses:create', err)
      if (
        err instanceof Error &&
        (err.message === 'PROPERTY_NOT_FOUND' || err.message === 'CATEGORY_NOT_FOUND')
      ) {
        throw err
      }
      throw new Error('FAILED_TO_CREATE_RECURRING_TEMPLATE')
    }
  })

  ipcMain.handle('recurringExpenses:update', async (_, rawData: unknown) => {
    try {
      const data = templateUpdateSchema.parse(rawData)

      const existing = db
        .prepare('SELECT * FROM recurring_expense_templates WHERE id = ?')
        .get(data.id) as Record<string, unknown> | undefined
      if (!existing) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')

      if (data.property_id !== null) {
        const prop = db
          .prepare('SELECT id FROM properties WHERE id = ? AND is_archived = 0')
          .get(data.property_id)
        if (!prop) throw new Error('PROPERTY_NOT_FOUND')
      }

      const cat = db.prepare('SELECT id FROM expense_categories WHERE id = ?').get(data.category_id)
      if (!cat) throw new Error('CATEGORY_NOT_FOUND')

      const normalizedFreq = normalizeFrequency(data.frequency)
      const existingSchedule = loadTemplateForSchedule(existing)
      const updatedSchedule: RecurringScheduleTemplate = {
        ...existingSchedule,
        frequency: normalizedFreq,
        day_of_month: data.day_of_month,
        start_date: data.start_date,
        end_date: data.end_date ?? null
      }
      const recalculatedNextDue = getNextDueDate(
        updatedSchedule,
        existingSchedule.last_generated_date ?? data.start_date
      )

      db.prepare(
        `UPDATE recurring_expense_templates
         SET property_id = ?, category_id = ?, name = ?, amount = ?, currency = ?,
             frequency = ?, day_of_month = ?, start_date = ?, end_date = ?,
             next_due_date = ?, vendor_name = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        data.property_id,
        data.category_id,
        data.name,
        data.amount,
        data.currency.toUpperCase(),
        normalizedFreq,
        data.day_of_month,
        data.start_date,
        data.end_date ?? null,
        recalculatedNextDue,
        data.vendor_name ?? null,
        data.notes ?? null,
        data.id
      )

      return { success: true }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === 'RECURRING_TEMPLATE_NOT_FOUND' ||
          err.message === 'PROPERTY_NOT_FOUND' ||
          err.message === 'CATEGORY_NOT_FOUND')
      ) {
        throw err
      }
      throw new Error('FAILED_TO_UPDATE_RECURRING_TEMPLATE')
    }
  })

  ipcMain.handle('recurringExpenses:activate', async (_, rawId: unknown) => {
    try {
      const id = idSchema.parse(rawId)
      const res = db
        .prepare('UPDATE recurring_expense_templates SET is_active = 1 WHERE id = ?')
        .run(id)
      if (res.changes === 0) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')
      return { success: true, is_active: true }
    } catch (err) {
      if (err instanceof Error && err.message === 'RECURRING_TEMPLATE_NOT_FOUND') throw err
      throw new Error('FAILED_TO_ACTIVATE_RECURRING_TEMPLATE')
    }
  })

  ipcMain.handle('recurringExpenses:deactivate', async (_, rawId: unknown) => {
    try {
      const id = idSchema.parse(rawId)
      const res = db
        .prepare('UPDATE recurring_expense_templates SET is_active = 0 WHERE id = ?')
        .run(id)
      if (res.changes === 0) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')
      return { success: true, is_active: false }
    } catch (err) {
      if (err instanceof Error && err.message === 'RECURRING_TEMPLATE_NOT_FOUND') throw err
      throw new Error('FAILED_TO_DEACTIVATE_RECURRING_TEMPLATE')
    }
  })

  ipcMain.handle('recurringExpenses:toggleActive', async (_, rawId: unknown) => {
    try {
      const id = idSchema.parse(rawId)
      const row = db
        .prepare('SELECT is_active FROM recurring_expense_templates WHERE id = ?')
        .get(id) as { is_active: number } | undefined
      if (!row) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')

      const nextActive = row.is_active === 1 ? 0 : 1
      db.prepare('UPDATE recurring_expense_templates SET is_active = ? WHERE id = ?').run(
        nextActive,
        id
      )

      return { success: true, is_active: nextActive === 1 }
    } catch (err) {
      if (err instanceof Error && err.message === 'RECURRING_TEMPLATE_NOT_FOUND') throw err
      throw new Error('FAILED_TO_TOGGLE_RECURRING_TEMPLATE')
    }
  })

  ipcMain.handle('recurringExpenses:delete', async (_, rawId: unknown) => {
    try {
      const id = idSchema.parse(rawId)
      const res = db.prepare('DELETE FROM recurring_expense_templates WHERE id = ?').run(id)
      if (res.changes === 0) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')
      return { success: true }
    } catch (err) {
      if (err instanceof Error && err.message === 'RECURRING_TEMPLATE_NOT_FOUND') throw err
      throw new Error('FAILED_TO_DELETE_RECURRING_TEMPLATE')
    }
  })

  const handleSkip = async (_: unknown, rawData: unknown): Promise<{ success: boolean }> => {
    try {
      const data = skipSchema.parse(rawData)
      const tplRow = db
        .prepare('SELECT * FROM recurring_expense_templates WHERE id = ?')
        .get(data.template_id) as Record<string, unknown> | undefined
      if (!tplRow) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')

      if (isInstanceActioned(data.template_id, data.due_date)) {
        throw new Error('INSTANCE_ALREADY_ACTIONED')
      }

      const template = loadTemplateForSchedule(tplRow)
      db.transaction(() => {
        insertLogRow({
          template_id: data.template_id,
          due_date: data.due_date,
          action: 'skipped',
          expense_id: null,
          skip_reason: data.skip_reason
        })
        advanceTemplateCursor(data.template_id, template, data.due_date)
      })()

      return { success: true }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === 'RECURRING_TEMPLATE_NOT_FOUND' ||
          err.message === 'INSTANCE_ALREADY_ACTIONED')
      ) {
        throw err
      }
      throw new Error('FAILED_TO_SKIP_RECURRING_EXPENSE')
    }
  }

  ipcMain.handle('recurringExpenses:skip', handleSkip)
  ipcMain.handle('recurringExpenses:skipInstance', handleSkip)

  const handleConfirm = async (
    _: unknown,
    rawData: unknown
  ): Promise<{ success: boolean; expense_id: number }> => {
    try {
      const data = confirmSchema.parse(rawData)
      const tplRow = db
        .prepare(
          `SELECT t.*, p.currency as prop_currency
           FROM recurring_expense_templates t
           LEFT JOIN properties p ON t.property_id = p.id AND p.is_archived = 0
           WHERE t.id = ?`
        )
        .get(data.template_id) as Record<string, unknown> | undefined

      if (!tplRow) throw new Error('RECURRING_TEMPLATE_NOT_FOUND')

      if (isInstanceActioned(data.template_id, data.due_date)) {
        throw new Error('INSTANCE_ALREADY_ACTIONED')
      }

      const template = loadTemplateForSchedule(tplRow)
      const propertyId = tplRow['property_id'] !== null ? Number(tplRow['property_id']) : null
      const categoryId = Number(tplRow['category_id'])
      const templateAmount = Number(tplRow['amount'])
      const templateCurrency = String(tplRow['currency'])
      const propCurrency = tplRow['prop_currency'] ? String(tplRow['prop_currency']) : null
      const vendorName = tplRow['vendor_name'] ? String(tplRow['vendor_name']) : null
      const tplName = String(tplRow['name'])

      const confirmAmount = data.amount ?? templateAmount
      const effectiveCurrency = propCurrency ?? templateCurrency
      const finalNotes = data.notes ?? `[recurring_auto] ${tplName} ${data.due_date}`

      let createdExpenseId = 0
      db.transaction(() => {
        const { expense_id } = createExpense(db, {
          property_id: propertyId,
          category_id: categoryId,
          recurring_template_id: data.template_id,
          expense_date: data.due_date,
          vendor_name: vendorName,
          amount: confirmAmount,
          currency: templateCurrency,
          property_currency: effectiveCurrency,
          notes: finalNotes
        })

        createdExpenseId = expense_id

        insertLogRow({
          template_id: data.template_id,
          due_date: data.due_date,
          action: 'confirmed',
          expense_id: createdExpenseId,
          skip_reason: null
        })

        advanceTemplateCursor(data.template_id, template, data.due_date)
      })()

      return { success: true, expense_id: createdExpenseId }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === 'RECURRING_TEMPLATE_NOT_FOUND' ||
          err.message === 'INSTANCE_ALREADY_ACTIONED')
      ) {
        throw err
      }
      if (err instanceof ExpenseError) {
        throw new Error(err.message)
      }
      throw new Error('FAILED_TO_CONFIRM_RECURRING_EXPENSE')
    }
  }

  ipcMain.handle('recurringExpenses:confirm', handleConfirm)
  ipcMain.handle('recurringExpenses:confirmInstance', handleConfirm)

  ipcMain.handle('recurringExpenses:pendingDue', async () => {
    try {
      const today = toLocalISODate(new Date())
      const rows = db
        .prepare(
          `SELECT t.id as template_id,
                  t.name,
                  t.property_id,
                  p.name as property_name,
                  t.next_due_date as due_date,
                  t.amount,
                  t.currency,
                  t.vendor_name,
                  t.frequency
           FROM recurring_expense_templates t
           LEFT JOIN properties p ON t.property_id = p.id
           WHERE t.is_active = 1
             AND t.next_due_date IS NOT NULL
             AND t.next_due_date <= ?
             AND (t.end_date IS NULL OR t.end_date >= t.next_due_date)
             AND NOT EXISTS (
               SELECT 1 FROM recurring_expense_log l
               WHERE l.template_id = t.id AND l.due_date = t.next_due_date
             )
           ORDER BY t.next_due_date ASC, t.name ASC`
        )
        .all(today)
      return rows
    } catch (err) {
      if (process.env.NODE_ENV !== 'production')
        logger.error('Error in recurringExpenses:pendingDue', err)
      throw new Error('FAILED_TO_GET_PENDING_DUE_RECURRING_EXPENSES')
    }
  })

  const handleLogList = async (_: unknown, rawTemplateId: unknown): Promise<unknown[]> => {
    try {
      const templateId = idSchema.parse(rawTemplateId)
      return db
        .prepare(
          `SELECT l.*, e.amount as expense_amount, e.currency as expense_currency
           FROM recurring_expense_log l
           LEFT JOIN expenses e ON l.expense_id = e.id
           WHERE l.template_id = ?
           ORDER BY l.created_at DESC`
        )
        .all(templateId)
    } catch {
      throw new Error('FAILED_TO_LIST_RECURRING_LOGS')
    }
  }

  ipcMain.handle('recurringExpenses:log', handleLogList)
  ipcMain.handle('recurringExpenses:logList', handleLogList)

  ipcMain.handle('recurringExpenses:evaluate', async () => {
    try {
      evaluateRecurringExpenses()
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_EVALUATE_RECURRING_EXPENSES')
    }
  })
}
