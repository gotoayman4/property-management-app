/**
 * INTENT: Recurring expense template CRUD + due-instance lifecycle + startup evaluation.
 *         Implements SRS §5.16 (FR-REC-01..09) and business rules BR-23/24/25.
 *
 * ARCHITECTURE:
 *   - Schedule date math lives in db/recurringSchedule.ts (pure, unit-tested).
 *   - Each generated expense is written via createExpense(), which atomically appends its
 *     ledger entry (BR-20/21) and enforces the BR-13 currency lock.
 *   - Duplicate prevention (BR-23) is enforced at TWO layers:
 *       (a) DB UNIQUE(template_id, due_date) on recurring_expense_log — the source of truth.
 *       (b) Application check before generating — so a clean error reaches the user instead
 *           of a raw SQLITE_CONSTRAINT.
 *
 * CONSTRAINT (BR-23): For any (template, due_date), only one action (confirmed OR skipped)
 *             may ever exist. A second confirm/skip for the same period is rejected.
 * CONSTRAINT (BR-24): Paused templates (is_active=0) generate nothing.
 * CONSTRAINT (BR-25): Templates whose end_date has passed are auto-marked is_active=0 on
 *             every evaluation pass, so the Status column surfaces "Ended".
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

const FREQUENCY_ENUM = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual'])

const templateCreateSchema = z.object({
  property_id: z.number().int().positive().nullable(),
  category_id: z.number().int().positive(),
  name: z.string().min(2).max(150),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  frequency: FREQUENCY_ENUM,
  day_of_month: z.number().int().min(1).max(28).default(1),
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

const idSchema = z.number().int().positive()

const skipSchema = z.object({
  template_id: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  skip_reason: z.string().min(1).max(500)
})

const confirmSchema = z.object({
  template_id: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Optional overrides the user applies at confirm time (FR-REC-05 pre-fill + adjust).
  amount: z.number().positive().optional(),
  notes: z.string().max(500).optional().nullable()
})

/** Loads a template and projects it into the pure schedule-math shape. */
function loadTemplateForSchedule(row: Record<string, unknown>): RecurringScheduleTemplate {
  return {
    id: Number(row['id']),
    is_active: Number(row['is_active']),
    frequency: String(row['frequency']),
    day_of_month: Number(row['day_of_month']),
    start_date: String(row['start_date']),
    end_date: row['end_date'] ? String(row['end_date']) : null,
    last_generated_date: row['last_generated_date'] ? String(row['last_generated_date']) : null
  }
}

/**
 * INTENT: True when this (template, due_date) already has a confirmed or skipped log row.
 *         This is the BR-23 application-layer guard; the DB UNIQUE constraint is the backup.
 */
function isInstanceActioned(templateId: number, dueDate: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM recurring_expense_log WHERE template_id = ? AND due_date = ?')
    .get(templateId, dueDate)
  return !!row
}

/** Append a recurring_expense_log row inside the caller's transaction (or its own). */
function insertLogRow(row: {
  template_id: number
  due_date: string
  action: 'confirmed' | 'skipped'
  expense_id: number | null
  skip_reason: string | null
}): void {
  db.prepare(
    `INSERT INTO recurring_expense_log (template_id, due_date, action, expense_id, skip_reason)
     VALUES (?, ?, ?, ?, ?)`
  ).run(row.template_id, row.due_date, row.action, row.expense_id, row.skip_reason)
}

/** Persists the template's next_due_date + last_generated_date after a confirm/skip. */
function advanceTemplateCursor(
  templateId: number,
  template: RecurringScheduleTemplate,
  confirmedDate: string
): void {
  const nextDue = getNextDueDate(template, confirmedDate)
  db.prepare(
    `UPDATE recurring_expense_templates
     SET last_generated_date = ?, next_due_date = ?
     WHERE id = ?`
  ).run(confirmedDate, nextDue, templateId)
}

/**
 * INTENT: One pass of the startup evaluator. For each active template:
 *   (a) auto-mark ended if its end_date has passed (BR-25),
 *   (b) generate all due-and-unactioned instances up to today,
 *   (c) advance next_due_date past today.
 *
 * Each generated expense is created via createExpense() (atomic + BR-13). The recurring_expense_log
 * UNIQUE(template_id, due_date) constraint guarantees BR-23 even if this function is re-run after
 * a crash — already-confirmed instances are skipped via the application guard.
 */
export function evaluateRecurringExpenses(): void {
  const today = toLocalISODate(new Date())

  // BR-25: mark ended templates inactive first so they generate nothing this pass.
  db.prepare(
    `UPDATE recurring_expense_templates
     SET is_active = 0
     WHERE is_active = 1 AND end_date IS NOT NULL AND end_date < ?`
  ).run(today)

  const templates = db
    .prepare('SELECT * FROM recurring_expense_templates WHERE is_active = 1')
    .all() as Array<Record<string, unknown>>

  for (const row of templates) {
    const template = loadTemplateForSchedule(row)
    // On the first run (no last_generated_date), the start_date itself is a candidate when it
    // has arrived. On subsequent runs, we resume from the day after last_generated_date.
    if (!template.last_generated_date && template.start_date <= today) {
      processDueDateIfReached(template, template.start_date)
    }

    let nextDue = getNextDueDate(template, template.last_generated_date ?? template.start_date)
    while (nextDue && nextDue <= today) {
      processDueDateIfReached(template, nextDue)
      nextDue = getNextDueDate(template, nextDue)
    }
  }
}

/**
 * Helper for the evaluator: generate the expense for `dueDate` if it is today-or-earlier
 * AND has not already been actioned. Failures are logged but do not abort the batch; the
 * template's cursor is NOT advanced past a failed date so it is retried on the next run.
 */
function processDueDateIfReached(template: RecurringScheduleTemplate, dueDate: string): void {
  if (isInstanceActioned(template.id, dueDate)) {
    // Already confirmed or skipped — advance the cursor without re-generating.
    advanceTemplateCursor(template.id, template, dueDate)
    return
  }

  let propertyCurrency: string | null = null
  if (template.id) {
    const tplRow = db
      .prepare('SELECT property_id, currency FROM recurring_expense_templates WHERE id = ?')
      .get(template.id) as { property_id: number | null; currency: string } | undefined
    if (tplRow?.property_id) {
      const property = db
        .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
        .get(tplRow.property_id) as { currency: string } | undefined
      propertyCurrency = property ? property.currency : null
    }
    if (!propertyCurrency && tplRow) {
      propertyCurrency = tplRow.currency
    }
  }

  const tplRow = db
    .prepare(
      'SELECT category_id, amount, currency, vendor_name, name FROM recurring_expense_templates WHERE id = ?'
    )
    .get(template.id) as
    | {
        category_id: number
        amount: number
        currency: string
        vendor_name: string | null
        name: string
      }
    | undefined
  if (!tplRow) return

  // Wrap (expense creation + log row + cursor advance) so a crash leaves no half-state.
  // createExpense itself runs an inner transaction; nesting better-sqlite3 transactions is safe
  // (they behave as savepoints).
  try {
    db.transaction(() => {
      const { expense_id } = createExpense(db, {
        property_id: loadTemplatePropertyId(template.id),
        category_id: tplRow.category_id,
        recurring_template_id: template.id,
        expense_date: dueDate,
        vendor_name: tplRow.vendor_name,
        amount: tplRow.amount,
        currency: tplRow.currency,
        property_currency: propertyCurrency,
        notes: `Auto-generated from recurring template "${tplRow.name}" for ${dueDate}`
      })
      insertLogRow({
        template_id: template.id,
        due_date: dueDate,
        action: 'confirmed',
        expense_id,
        skip_reason: null
      })
      advanceTemplateCursor(template.id, template, dueDate)
    })()
  } catch (error: unknown) {
    // A blocked generation (e.g. currency mismatch) is logged but does not abort the batch.
    // The cursor is intentionally NOT advanced, so the failed date is retried next run.
    if (error instanceof ExpenseError) {
      console.error(
        `Recurring template #${template.id} generation failed for ${dueDate}: ${error.message}`
      )
    } else {
      throw error
    }
  }
}

function loadTemplatePropertyId(templateId: number): number | null {
  const row = db
    .prepare('SELECT property_id FROM recurring_expense_templates WHERE id = ?')
    .get(templateId) as { property_id: number | null } | undefined
  return row?.property_id ?? null
}

export function registerRecurringExpenseIpcHandlers(): void {
  // List templates (FR-REC-08). Always returns next_due_date + status derived from is_active/end_date.
  ipcMain.handle('recurringExpenses:list', async (_, data: unknown) => {
    try {
      const filters = templateListFiltersSchema.parse(data)
      let query = 'SELECT * FROM recurring_expense_templates WHERE 1=1'
      const params: Array<string | number> = []
      if (filters?.property_id !== undefined) {
        query += ' AND property_id = ?'
        params.push(filters.property_id)
      }
      if (filters?.is_active !== undefined) {
        query += ' AND is_active = ?'
        params.push(filters.is_active ? 1 : 0)
      }
      if (filters?.frequency) {
        query += ' AND frequency = ?'
        params.push(filters.frequency)
      }
      query += ' ORDER BY created_at DESC'
      return db.prepare(query).all(...params)
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_RECURRING')
    }
  })

  ipcMain.handle('recurringExpenses:get', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      return db.prepare('SELECT * FROM recurring_expense_templates WHERE id = ?').get(id)
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_GET_RECURRING')
    }
  })

  // Create template. Seed next_due_date with start_date so the UI shows it immediately.
  ipcMain.handle('recurringExpenses:create', async (_, data: unknown) => {
    try {
      const parsed = templateCreateSchema.parse(data)
      const today = toLocalISODate(new Date())
      const scheduleInput = {
        ...parsed,
        end_date: parsed.end_date ?? null
      }
      const initialNextDue =
        parsed.start_date < today ? parsed.start_date : getNextDueDate(scheduleInput, today)
      const result = db
        .prepare(
          `INSERT INTO recurring_expense_templates
           (property_id, category_id, name, amount, currency, frequency, day_of_month,
            start_date, end_date, vendor_name, notes, next_due_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          parsed.property_id,
          parsed.category_id,
          parsed.name,
          parsed.amount,
          parsed.currency,
          normalizeFrequency(parsed.frequency),
          parsed.day_of_month,
          parsed.start_date,
          parsed.end_date ?? null,
          parsed.vendor_name ?? null,
          parsed.notes ?? null,
          initialNextDue
        )
      return { id: Number(result.lastInsertRowid) }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_CREATE_RECURRING')
    }
  })

  ipcMain.handle('recurringExpenses:update', async (_, data: unknown) => {
    try {
      const parsed = templateUpdateSchema.parse(data)
      db.prepare(
        `UPDATE recurring_expense_templates SET
         property_id = ?, category_id = ?, name = ?, amount = ?, currency = ?,
         frequency = ?, day_of_month = ?, start_date = ?, end_date = ?,
         vendor_name = ?, notes = ? WHERE id = ?`
      ).run(
        parsed.property_id,
        parsed.category_id,
        parsed.name,
        parsed.amount,
        parsed.currency,
        normalizeFrequency(parsed.frequency),
        parsed.day_of_month,
        parsed.start_date,
        parsed.end_date ?? null,
        parsed.vendor_name ?? null,
        parsed.notes ?? null,
        parsed.id
      )
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_UPDATE_RECURRING')
    }
  })

  // Pause (deactivate). BR-24: a paused template generates nothing.
  ipcMain.handle('recurringExpenses:deactivate', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      db.prepare('UPDATE recurring_expense_templates SET is_active = 0 WHERE id = ?').run(id)
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_DEACTIVATE_RECURRING')
    }
  })

  // Resume.
  ipcMain.handle('recurringExpenses:activate', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      // BR-25 guardrail: do not resume an ended template; the user must extend end_date first.
      const tpl = db
        .prepare('SELECT end_date FROM recurring_expense_templates WHERE id = ?')
        .get(id) as { end_date: string | null } | undefined
      if (
        tpl &&
        shouldMarkEnded(
          { ...tpl, frequency: 'monthly', day_of_month: 1, start_date: '' },
          toLocalISODate(new Date())
        )
      ) {
        throw new Error('TEMPLATE_ENDED')
      }
      db.prepare('UPDATE recurring_expense_templates SET is_active = 1 WHERE id = ?').run(id)
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof Error && error.message === 'TEMPLATE_ENDED') throw error
      throw new Error('FAILED_TO_ACTIVATE_RECURRING')
    }
  })

  // List pending due instances: all active templates whose next_due_date <= today and for
  // which that date has not yet been actioned (SRS §9.9.3 Pending Due Instances screen).
  ipcMain.handle('recurringExpenses:pendingDue', async () => {
    try {
      const today = toLocalISODate(new Date())
      const rows = db
        .prepare(
          `SELECT t.id AS template_id, t.name, t.property_id, t.next_due_date AS due_date,
                  t.amount, t.currency, t.vendor_name, t.frequency,
                  p.name AS property_name,
                  CASE WHEN l.template_id IS NOT NULL THEN 1 ELSE 0 END AS actioned
           FROM recurring_expense_templates t
           LEFT JOIN properties p ON p.id = t.property_id
           LEFT JOIN recurring_expense_log l
                  ON l.template_id = t.id AND l.due_date = t.next_due_date
           WHERE t.is_active = 1
             AND t.next_due_date IS NOT NULL
             AND t.next_due_date <= ?
             AND l.template_id IS NULL
           ORDER BY t.next_due_date ASC`
        )
        .all(today)
      return rows
    } catch {
      throw new Error('FAILED_TO_LIST_PENDING_DUE')
    }
  })

  // Confirm a due instance (FR-REC-05): create the expense from the template, log it, advance.
  ipcMain.handle('recurringExpenses:confirmInstance', async (_, data: unknown) => {
    try {
      const parsed = confirmSchema.parse(data)
      const tplRow = db
        .prepare('SELECT * FROM recurring_expense_templates WHERE id = ?')
        .get(parsed.template_id) as Record<string, unknown> | undefined
      if (!tplRow) throw new Error('TEMPLATE_NOT_FOUND')

      if (isInstanceActioned(parsed.template_id, parsed.due_date)) {
        throw new Error('INSTANCE_ALREADY_ACTIONED')
      }

      // Resolve the property currency for the BR-13 lock.
      let propertyCurrency: string | null = null
      const propertyId = tplRow['property_id'] ? Number(tplRow['property_id']) : null
      if (propertyId) {
        const property = db
          .prepare('SELECT currency FROM properties WHERE id = ?')
          .get(propertyId) as { currency: string } | undefined
        propertyCurrency = property ? property.currency : null
      } else {
        propertyCurrency = String(tplRow['currency'])
      }

      const template = loadTemplateForSchedule(tplRow)
      // Atomic: create expense + log + advance cursor. BR-23 enforced by both the application
      // check above and the UNIQUE(template_id, due_date) DB constraint on recurring_expense_log.
      const result = db.transaction(() => {
        const { expense_id } = createExpense(db, {
          property_id: propertyId,
          category_id: Number(tplRow['category_id']),
          recurring_template_id: parsed.template_id,
          expense_date: parsed.due_date,
          vendor_name: tplRow['vendor_name'] ? String(tplRow['vendor_name']) : null,
          amount: parsed.amount ?? Number(tplRow['amount']),
          currency: String(tplRow['currency']),
          property_currency: propertyCurrency,
          notes:
            parsed.notes ??
            `Generated from recurring template "${String(tplRow['name'])}" for ${parsed.due_date}`
        })
        insertLogRow({
          template_id: parsed.template_id,
          due_date: parsed.due_date,
          action: 'confirmed',
          expense_id,
          skip_reason: null
        })
        advanceTemplateCursor(parsed.template_id, template, parsed.due_date)
        return { expense_id }
      })()
      return result
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (
        error instanceof Error &&
        ['TEMPLATE_NOT_FOUND', 'INSTANCE_ALREADY_ACTIONED'].includes(error.message)
      ) {
        throw error
      }
      throw new Error('FAILED_TO_CONFIRM_INSTANCE')
    }
  })

  // Skip a due instance (FR-REC-06): no expense created; log with the required reason; advance.
  ipcMain.handle('recurringExpenses:skipInstance', async (_, data: unknown) => {
    try {
      const parsed = skipSchema.parse(data)
      const tplRow = db
        .prepare('SELECT * FROM recurring_expense_templates WHERE id = ?')
        .get(parsed.template_id) as Record<string, unknown> | undefined
      if (!tplRow) throw new Error('TEMPLATE_NOT_FOUND')
      if (isInstanceActioned(parsed.template_id, parsed.due_date)) {
        throw new Error('INSTANCE_ALREADY_ACTIONED')
      }

      const template = loadTemplateForSchedule(tplRow)
      db.transaction(() => {
        insertLogRow({
          template_id: parsed.template_id,
          due_date: parsed.due_date,
          action: 'skipped',
          expense_id: null,
          skip_reason: parsed.skip_reason
        })
        advanceTemplateCursor(parsed.template_id, template, parsed.due_date)
      })()
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (
        error instanceof Error &&
        ['TEMPLATE_NOT_FOUND', 'INSTANCE_ALREADY_ACTIONED'].includes(error.message)
      ) {
        throw error
      }
      throw new Error('FAILED_TO_SKIP_INSTANCE')
    }
  })

  // View the action history for a template (FR-REC-08 status column source).
  ipcMain.handle('recurringExpenses:log', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      return db
        .prepare(
          `SELECT l.*, e.expense_date
           FROM recurring_expense_log l
           LEFT JOIN expenses e ON e.id = l.expense_id
           WHERE l.template_id = ?
           ORDER BY l.due_date DESC`
        )
        .all(id)
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_RECURRING_LOG')
    }
  })
}
