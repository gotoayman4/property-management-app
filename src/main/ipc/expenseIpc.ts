import { ipcMain } from 'electron'
import { z } from 'zod'

const isDev = process.env.NODE_ENV !== 'production'
import { db } from '../db/database'
import {
  createExpense,
  voidExpense,
  listExpenses,
  listExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  ExpenseError,
  type CreateExpenseInput
} from '../db/expenseRepository'

/**
 * INTENT: IPC handlers for the expenses domain. All writes delegate to expenseRepository which
 *         wraps expense+ledger in ONE transaction (BR-21) and enforces the property-currency lock.
 */

const expenseCreateSchema = z.object({
  property_id: z.number().int().positive().optional().nullable(),
  category_id: z.number().int().positive(),
  recurring_template_id: z.number().int().positive().optional().nullable(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor_name: z.string().max(200).optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  notes: z.string().max(2000).optional().nullable(),
  receipt_file_path: z.string().max(1000).optional().nullable(),
  custom_exchange_rate: z.number().positive().optional().nullable()
})

const expenseListFiltersSchema = z
  .object({
    property_id: z.number().int().positive().optional(),
    category_id: z.number().int().positive().optional(),
    from_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    general_only: z.boolean().optional()
  })
  .optional()

const expenseVoidSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1).max(500)
})

const categoryCreateSchema = z.object({
  name_key: z.string().min(2).max(80)
})

const categoryUpdateSchema = z.object({
  id: z.number().int().positive(),
  name_key: z.string().min(2).max(80)
})

export function registerExpenseIpcHandlers(): void {
  ipcMain.handle('expenseCategories:list', async () => {
    try {
      return listExpenseCategories(db)
    } catch (error) {
      if (isDev) console.error('Error listing expense categories:', error)
      throw new Error('FAILED_TO_LIST_EXPENSE_CATEGORIES')
    }
  })

  ipcMain.handle('expenseCategories:create', async (_, data: unknown) => {
    try {
      const v = categoryCreateSchema.parse(data)
      const id = createExpenseCategory(db, v.name_key)
      return { id }
    } catch (error: unknown) {
      if (isDev) console.error('Error creating expense category:', error)
      if (error instanceof ExpenseError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_CREATE_EXPENSE_CATEGORY')
    }
  })

  ipcMain.handle('expenseCategories:update', async (_, data: unknown) => {
    try {
      const v = categoryUpdateSchema.parse(data)
      updateExpenseCategory(db, v.id, v.name_key)
      return { success: true }
    } catch (error: unknown) {
      if (isDev) console.error('Error updating expense category:', error)
      if (error instanceof ExpenseError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_UPDATE_EXPENSE_CATEGORY')
    }
  })

  ipcMain.handle('expenseCategories:delete', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      deleteExpenseCategory(db, id)
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof ExpenseError) throw new Error(error.message)
      if (isDev) console.error('Error deleting expense category:', error)
      throw new Error('FAILED_TO_DELETE_EXPENSE_CATEGORY')
    }
  })

  ipcMain.handle('expenses:list', async (_, filters?: unknown) => {
    try {
      const parsed = expenseListFiltersSchema.parse(filters)
      return listExpenses(db, parsed)
    } catch (error: unknown) {
      if (isDev) console.error('Error listing expenses:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_EXPENSES')
    }
  })

  ipcMain.handle('expenses:get', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      return db
        .prepare(
          `SELECT e.*, p.name AS property_name, p.code AS property_code,
                  ec.name_key AS category_name_key
           FROM expenses e
           LEFT JOIN properties p ON e.property_id = p.id
           JOIN expense_categories ec ON e.category_id = ec.id
           WHERE e.id = ?`
        )
        .get(id)
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (isDev) console.error('Error getting expense:', error)
      throw new Error('FAILED_TO_GET_EXPENSE')
    }
  })

  ipcMain.handle('expenses:create', async (_, data: unknown) => {
    try {
      const v = expenseCreateSchema.parse(data)
      // Resolve the property currency for the BR-13 lock when property-linked.
      let propertyCurrency: string | null = null
      if (v.property_id) {
        const property = db
          .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
          .get(v.property_id) as { currency: string } | undefined
        if (!property) throw new Error('PROPERTY_NOT_FOUND')
        propertyCurrency = property.currency
      }

      const input: CreateExpenseInput = {
        property_id: v.property_id ?? null,
        category_id: v.category_id,
        recurring_template_id: v.recurring_template_id ?? null,
        expense_date: v.expense_date,
        vendor_name: v.vendor_name ?? null,
        amount: v.amount,
        currency: v.currency,
        property_currency: propertyCurrency,
        notes: v.notes ?? null,
        receipt_file_path: v.receipt_file_path ?? null,
        custom_exchange_rate: v.custom_exchange_rate ?? null
      }
      return createExpense(db, input)
    } catch (error: unknown) {
      console.error('Error creating expense:', error)
      if (error instanceof ExpenseError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  ipcMain.handle('expenses:void', async (_, payload: unknown) => {
    try {
      const v = expenseVoidSchema.parse(payload)
      return voidExpense(db, v.id, v.reason)
    } catch (error: unknown) {
      console.error('Error voiding expense:', error)
      if (error instanceof ExpenseError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_VOID_EXPENSE')
    }
  })
}
