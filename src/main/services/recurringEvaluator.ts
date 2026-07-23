/**
 * @file recurringEvaluator — Recurring expense evaluation engine and log management.
 * INTENT: Evaluates recurring expense templates on startup and generates due expense instances.
 *         Implements SRS §5.16 (FR-REC-01..09) and business rules BR-23/24/25.
 */
import { db } from '../db/database'
import { createExpense } from '../db/expenseRepository'
import {
  getNextDueDate,
  toLocalISODate,
  type RecurringScheduleTemplate
} from '../db/recurringSchedule'

/** Loads a template and projects it into the pure schedule-math shape. */
export function loadTemplateForSchedule(row: Record<string, unknown>): RecurringScheduleTemplate {
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
export function isInstanceActioned(templateId: number, dueDate: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM recurring_expense_log WHERE template_id = ? AND due_date = ?')
    .get(templateId, dueDate)
  return !!row
}

/** Append a recurring_expense_log row inside the caller's transaction (or its own). */
export function insertLogRow(row: {
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
export function advanceTemplateCursor(
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
 * AND has not already been actioned.
 */
export function processDueDateIfReached(
  template: RecurringScheduleTemplate,
  dueDate: string
): void {
  if (isInstanceActioned(template.id, dueDate)) {
    advanceTemplateCursor(template.id, template, dueDate)
    return
  }

  const tplRow = db
    .prepare(
      `SELECT property_id, category_id, amount, currency, vendor_name, name
       FROM recurring_expense_templates WHERE id = ?`
    )
    .get(template.id) as
    | {
        property_id: number | null
        category_id: number
        amount: number
        currency: string
        vendor_name: string | null
        name: string
      }
    | undefined
  if (!tplRow) return

  let propertyCurrency: string | null = null
  if (tplRow.property_id) {
    const property = db
      .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
      .get(tplRow.property_id) as { currency: string } | undefined
    propertyCurrency = property ? property.currency : null
  }
  if (!propertyCurrency) {
    propertyCurrency = tplRow.currency
  }

  try {
    db.transaction(() => {
      const { expense_id } = createExpense(db, {
        property_id: tplRow.property_id,
        category_id: tplRow.category_id,
        recurring_template_id: template.id,
        expense_date: dueDate,
        vendor_name: tplRow.vendor_name,
        amount: tplRow.amount,
        currency: tplRow.currency,
        property_currency: propertyCurrency,
        notes: `[recurring_auto] ${tplRow.name} ${dueDate}`
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
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        `Failed to process recurring expense for template ${template.id} on ${dueDate}:`,
        err
      )
    }
  }
}
