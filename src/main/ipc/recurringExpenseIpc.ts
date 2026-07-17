/**
 * INTENT: Recurring expense template CRUD + evaluation. On app startup, evaluate()
 *         generates expense rows from active templates whose next due date has passed.
 * CONSTRAINT: Each generated expense is created via createExpense(), which atomically
 *             writes the expense row AND its ledger entry in one transaction (BR-20/21),
 *             and enforces the BR-13 property-currency lock. Recurring expenses are
 *             first-class financial events and MUST appear in the ledger.
 */
import { ipcMain } from 'electron'
import { db } from '../db/database'
import { z } from 'zod'
import { createExpense, ExpenseError } from '../db/expenseRepository'

const templateCreateSchema = z.object({
  property_id: z.number().int().positive().nullable(),
  category_id: z.number().int().positive(),
  description: z.string().min(3).max(200),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']),
  day_of_month: z.number().int().min(1).max(28).default(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  vendor_name: z.string().max(100).optional().nullable()
})

const templateUpdateSchema = templateCreateSchema.extend({
  id: z.number().int().positive()
})

interface RecurringTemplate {
  id: number
  property_id: number | null
  category_id: number
  description: string
  amount: number
  currency: string
  frequency: string
  day_of_month: number
  start_date: string
  end_date: string | null
  vendor_name: string | null
  is_active: number
  last_generated_date: string | null
}

/**
 * INTENT: Format a Date as a YYYY-MM-DD string using LOCAL calendar fields.
 * CONSTRAINT: `Date.toISOString()` converts to UTC, which silently rolls the day backward
 *             for any user in a positive UTC offset (e.g. AST +3) and corrupts month/quarter
 *             boundaries. All due-date math must stay in local time.
 * DECISION: Build the string from local getFullYear/getMonth/getDate rather than toISOString.
 */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getNextDueDate(template: RecurringTemplate, afterDate: string): string | null {
  const start = new Date(template.start_date)
  const end = template.end_date ? new Date(template.end_date) : null
  const after = new Date(afterDate)

  // If start date is in the future, next due is start date itself
  if (start > after) {
    return template.start_date
  }

  const base = new Date(Math.max(start.getTime(), after.getTime()))
  const day = template.day_of_month

  // Calculate next occurrence based on frequency
  let next: Date
  switch (template.frequency) {
    case 'monthly':
      next = new Date(base.getFullYear(), base.getMonth() + 1, day)
      break
    case 'quarterly':
      next = new Date(base.getFullYear(), base.getMonth() + 3, day)
      break
    case 'semi_annual':
      next = new Date(base.getFullYear(), base.getMonth() + 6, day)
      break
    case 'annual':
      next = new Date(base.getFullYear() + 1, base.getMonth(), day)
      break
    default:
      return null
  }

  const nextStr = toLocalISODate(next)
  if (end && nextStr > toLocalISODate(end)) return null
  return nextStr
}

/** Evaluate active templates and generate expenses (with ledger entries) for any due dates. Called on app startup. */
export function evaluateRecurringExpenses(): void {
  const templates = db
    .prepare('SELECT * FROM recurring_expense_templates WHERE is_active = 1')
    .all() as RecurringTemplate[]

  const today = toLocalISODate(new Date())

  const updateLastGenerated = db.prepare(
    'UPDATE recurring_expense_templates SET last_generated_date = ? WHERE id = ?'
  )

  for (const template of templates) {
    const afterDate = template.last_generated_date ?? template.start_date
    let nextDue = getNextDueDate(template, afterDate)

    // Generate all expenses up to today. Each created expense posts its own ledger entry
    // atomically via createExpense() (BR-20/21) and respects the BR-13 currency lock.
    while (nextDue && nextDue <= today) {
      try {
        // Resolve the linked property's currency for the BR-13 lock when property-linked.
        let propertyCurrency: string | null = null
        if (template.property_id) {
          const property = db
            .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
            .get(template.property_id) as { currency: string } | undefined
          propertyCurrency = property ? property.currency : null
        }

        createExpense(db, {
          property_id: template.property_id,
          category_id: template.category_id,
          recurring_template_id: template.id,
          expense_date: nextDue,
          vendor_name: template.vendor_name,
          amount: template.amount,
          currency: template.currency,
          property_currency: propertyCurrency,
          notes: `Auto-generated from recurring template #${template.id}: ${template.description}`
        })
        updateLastGenerated.run(nextDue, template.id)
      } catch (error: unknown) {
        // A blocked generation (e.g. currency mismatch) must not abort the whole batch —
        // skip this due date and continue with the rest. The template's last_generated_date
        // is intentionally NOT advanced so the failure is retried on the next startup.
        if (error instanceof ExpenseError) {
          console.error(
            `Recurring template #${template.id} generation failed for ${nextDue}: ${error.message}`
          )
        } else {
          throw error
        }
      }

      nextDue = getNextDueDate(template, nextDue)
    }
  }
}

export function registerRecurringExpenseIpcHandlers(): void {
  // List templates
  ipcMain.handle(
    'recurringExpenses:list',
    async (_, filters?: { property_id?: number; is_active?: boolean }) => {
      try {
        let query = 'SELECT * FROM recurring_expense_templates'
        const conditions: string[] = []
        const params: (number | number)[] = []

        if (filters?.property_id) {
          conditions.push('property_id = ?')
          params.push(filters.property_id)
        }
        if (filters?.is_active !== undefined) {
          conditions.push('is_active = ?')
          params.push(filters.is_active ? 1 : 0)
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ')
        }
        query += ' ORDER BY created_at DESC'

        return db.prepare(query).all(...params)
      } catch {
        throw new Error('FAILED_TO_LIST_RECURRING')
      }
    }
  )

  // Get single template
  ipcMain.handle('recurringExpenses:get', async (_, id: number) => {
    try {
      return db.prepare('SELECT * FROM recurring_expense_templates WHERE id = ?').get(id)
    } catch {
      throw new Error('FAILED_TO_GET_RECURRING')
    }
  })

  // Create template
  ipcMain.handle('recurringExpenses:create', async (_, data: unknown) => {
    try {
      const parsed = templateCreateSchema.parse(data)
      const result = db
        .prepare(
          `INSERT INTO recurring_expense_templates
           (property_id, category_id, description, amount, currency, frequency, day_of_month, start_date, end_date, vendor_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          parsed.property_id,
          parsed.category_id,
          parsed.description,
          parsed.amount,
          parsed.currency,
          parsed.frequency,
          parsed.day_of_month,
          parsed.start_date,
          parsed.end_date ?? null,
          parsed.vendor_name ?? null
        )
      return { id: result.lastInsertRowid }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_CREATE_RECURRING')
    }
  })

  // Update template
  ipcMain.handle('recurringExpenses:update', async (_, data: unknown) => {
    try {
      const parsed = templateUpdateSchema.parse(data)
      db.prepare(
        `UPDATE recurring_expense_templates SET
         property_id = ?, category_id = ?, description = ?, amount = ?, currency = ?,
         frequency = ?, day_of_month = ?, start_date = ?, end_date = ?, vendor_name = ?
         WHERE id = ?`
      ).run(
        parsed.property_id,
        parsed.category_id,
        parsed.description,
        parsed.amount,
        parsed.currency,
        parsed.frequency,
        parsed.day_of_month,
        parsed.start_date,
        parsed.end_date ?? null,
        parsed.vendor_name ?? null,
        parsed.id
      )
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_UPDATE_RECURRING')
    }
  })

  // Deactivate (soft stop) a template
  ipcMain.handle('recurringExpenses:deactivate', async (_, id: number) => {
    try {
      db.prepare('UPDATE recurring_expense_templates SET is_active = 0 WHERE id = ?').run(id)
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_DEACTIVATE_RECURRING')
    }
  })

  // Reactivate a template
  ipcMain.handle('recurringExpenses:activate', async (_, id: number) => {
    try {
      db.prepare('UPDATE recurring_expense_templates SET is_active = 1 WHERE id = ?').run(id)
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_ACTIVATE_RECURRING')
    }
  })
}
