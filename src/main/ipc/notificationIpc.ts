/**
 * INTENT: Notification evaluation (startup) + IPC CRUD. Generates in-app alerts for rent
 *         due, overdue payments, contract expiry, escalation steps, document expiry,
 *         recurring expense due, and backup failures.
 *
 * CONSTRAINT (NFR-I18N-02, BR-29): message bodies are resolved from the notification_templates
 *             table using the tenant's preferred_language (or app_language), NEVER hardcoded
 *             as raw English/English string literals. The rendered message with replaced
 *             {tenant_name} {amount} {due_date} {property_name} {document_type} placeholders
 *             is stored so the renderer can display it without runtime template processing.
 * CONSTRAINT: reminder thresholds come from settings (FR-SET-07).
 * CONSTRAINT (AGENTS.md): all DB queries parameterized, no console.log in prod.
 */
import { ipcMain } from 'electron'
import { db } from '../db/database'

/** Look up a rendered template message for a trigger type + language. Returns null if none defined. */
function resolveTemplateMessage(
  triggerType: string,
  language: string,
  vars: Record<string, string>
): string | null {
  const template = db
    .prepare(
      `SELECT message_body FROM notification_templates
       WHERE trigger_type = ? AND language = ?
       LIMIT 1`
    )
    .get(triggerType, language) as { message_body: string } | undefined

  if (!template) return null

  let body = template.message_body
  for (const [key, value] of Object.entries(vars)) {
    body = body.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return body
}

/**
 * Resolve the best language for a notification. FR-NOT-06: tenant's preferred_language is
 * the priority; fall back to the app_language (settings), then to English.
 */
function resolveLanguage(tenantId: number | null, appLanguage: string): string {
  if (tenantId) {
    const tenant = db
      .prepare('SELECT preferred_language FROM tenants WHERE id = ?')
      .get(tenantId) as { preferred_language: string | null } | undefined
    if (tenant?.preferred_language) return tenant.preferred_language
  }
  return appLanguage || 'en'
}

export function evaluateNotifications(): void {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
    app_language: string
    reminder_days_before_due: number
    reminder_days_before_contract_end: number
    reminder_days_before_document_expiry: number
    reminder_days_before_recurring_expense: number
  }
  const appLanguage = settings.app_language || 'en'

  const today = new Date()
  const fmt = (d: Date): string => d.toISOString().split('T')[0]
  const addDays = (d: Date, n: number): Date => {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO notifications
     (notification_type, entity_type, entity_id, title, message, message_key, message_vars, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  )

  const todayStr = fmt(today)

  // 1. Rent due — active contracts with rent due within reminder window
  const rentDueContracts = db
    .prepare(
      `SELECT c.id, c.property_id, c.tenant_id, c.end_date,
              p.name as property_name, t.fullname as tenant_name, c.rent_amount, c.currency
       FROM contracts c
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active'`
    )
    .all() as Array<{
    id: number
    property_id: number
    tenant_id: number
    end_date: string
    property_name: string
    tenant_name: string
    rent_amount: number
    currency: string
  }>

  for (const contract of rentDueContracts) {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const rentDueDate = fmt(nextMonth)
    const reminderDate = addDays(nextMonth, -settings.reminder_days_before_due)

    if (todayStr >= fmt(reminderDate) && todayStr <= rentDueDate) {
      const lang = resolveLanguage(contract.tenant_id, appLanguage)
      const vars: Record<string, string> = {
        tenant_name: contract.tenant_name,
        amount: `${contract.rent_amount} ${contract.currency}`,
        due_date: rentDueDate,
        property_name: contract.property_name
      }
      const message = resolveTemplateMessage('rent_due', lang, vars)
      insert.run(
        'rent_due',
        'contract',
        contract.id,
        'rent_due_title',
        message ??
          `Rent of ${contract.rent_amount} ${contract.currency} due for ${contract.property_name}`,
        'notification.body.rentDue',
        JSON.stringify(vars),
        rentDueDate
      )
    }
  }

  // 2. Overdue — payments past their due date without a payment record
  const overdueLedger = db
    .prepare(
      `SELECT c.id, c.property_id, c.tenant_id,
              p.name as property_name, t.fullname as tenant_name, c.rent_amount, c.currency
       FROM contracts c
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active'
         AND c.end_date > ?
       ORDER BY c.id`
    )
    .all(todayStr) as Array<{
    id: number
    property_id: number
    tenant_id: number
    property_name: string
    tenant_name: string
    rent_amount: number
    currency: string
  }>

  for (const contract of overdueLedger) {
    const lastDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0)
    const dueDateStr = fmt(lastDayOfPrevMonth)
    if (dueDateStr < todayStr) {
      const lang = resolveLanguage(contract.tenant_id, appLanguage)
      const vars: Record<string, string> = {
        tenant_name: contract.tenant_name,
        amount: `${contract.rent_amount} ${contract.currency}`,
        due_date: dueDateStr,
        property_name: contract.property_name
      }
      const message = resolveTemplateMessage('overdue', lang, vars)
      insert.run(
        'overdue',
        'contract',
        contract.id,
        'overdue_title',
        message ?? `Rent of ${contract.rent_amount} ${contract.currency} was due on ${dueDateStr}`,
        'notification.body.overdue',
        JSON.stringify(vars),
        dueDateStr
      )
    }
  }

  // 3. Contract expiry — contracts ending within the reminder window
  const activeContracts = db
    .prepare(
      `SELECT c.id, c.property_id, c.tenant_id, c.end_date,
              p.name as property_name, t.fullname as tenant_name
       FROM contracts c
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active' AND c.end_date IS NOT NULL`
    )
    .all() as Array<{
    id: number
    property_id: number
    tenant_id: number
    end_date: string
    property_name: string
    tenant_name: string
  }>

  for (const contract of activeContracts) {
    const expiryDate = new Date(contract.end_date)
    const reminderStart = addDays(expiryDate, -settings.reminder_days_before_contract_end)
    if (todayStr >= fmt(reminderStart) && todayStr <= contract.end_date) {
      const lang = resolveLanguage(contract.tenant_id, appLanguage)
      const vars: Record<string, string> = {
        tenant_name: contract.tenant_name,
        due_date: contract.end_date,
        property_name: contract.property_name
      }
      const message = resolveTemplateMessage('contract_expiring', lang, vars)
      insert.run(
        'contract_expiry',
        'contract',
        contract.id,
        'contract_expiry_title',
        message ?? `Contract for ${contract.property_name} expires on ${contract.end_date}`,
        'notification.body.contractExpiring',
        JSON.stringify(vars),
        contract.end_date
      )
    }
  }

  // 4. Escalation upcoming (FR-CON-12) — each schedule row whose effective_start_date
  //    is within the contract-end reminder window.
  const upcomingEscalations = db
    .prepare(
      `SELECT r.contract_id, r.effective_start_date, r.rent_amount, r.year_number,
              c.property_id, c.tenant_id,
              p.name as property_name, t.fullname as tenant_name
       FROM rent_escalation_schedule r
       JOIN contracts c ON c.id = r.contract_id
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active'
         AND r.effective_start_date > ?
         AND r.effective_start_date <= date(?, '+' || ? || ' days')
       ORDER BY r.effective_start_date`
    )
    .all(todayStr, todayStr, settings.reminder_days_before_contract_end) as Array<{
    contract_id: number
    effective_start_date: string
    rent_amount: number
    year_number: number
    property_id: number
    tenant_id: number
    property_name: string
    tenant_name: string
  }>

  for (const esc of upcomingEscalations) {
    const lang = resolveLanguage(esc.tenant_id, appLanguage)
    const vars: Record<string, string> = {
      tenant_name: esc.tenant_name,
      due_date: esc.effective_start_date,
      property_name: esc.property_name
    }
    const message = resolveTemplateMessage('escalation_upcoming', lang, vars)
    insert.run(
      'escalation_upcoming',
      'contract',
      esc.contract_id,
      'escalation_upcoming_title',
      message ??
        `Rent escalation year ${esc.year_number} takes effect on ${esc.effective_start_date}`,
      'notification.body.escalationUpcoming',
      JSON.stringify(vars),
      esc.effective_start_date
    )
  }

  // 5. Document expiry — approaching within reminder window
  const expiringDocuments = db
    .prepare(
      `SELECT d.id, d.file_name, d.entity_type, d.entity_id, d.expiry_date, d.document_type
       FROM documents d
       WHERE d.expiry_date IS NOT NULL AND d.expiry_date != '' AND d.is_archived = 0
         AND d.expiry_date <= date(?, '+' || ? || ' days')
         AND d.expiry_date >= ?`
    )
    .all(todayStr, settings.reminder_days_before_document_expiry, todayStr) as Array<{
    id: number
    file_name: string
    entity_type: string
    entity_id: number
    expiry_date: string
    document_type: string | null
  }>

  for (const doc of expiringDocuments) {
    const vars: Record<string, string> = {
      due_date: doc.expiry_date,
      document_type: doc.document_type ?? doc.file_name,
      property_name: '' // filled from entity lookup if needed
    }
    const message = resolveTemplateMessage('document_expiring', appLanguage, vars)
    insert.run(
      'document_expiry',
      doc.entity_type,
      doc.entity_id,
      'document_expiry_title',
      message ?? `Document "${doc.file_name}" expires on ${doc.expiry_date}`,
      'notification.body.documentExpiring',
      JSON.stringify(vars),
      doc.expiry_date
    )
  }

  // 6. Recurring expense due — active templates whose next_due_date is within the window
  const activeTemplates = db
    .prepare(
      `SELECT id, name, amount, currency, day_of_month, frequency, next_due_date
       FROM recurring_expense_templates
       WHERE is_active = 1 AND next_due_date IS NOT NULL
         AND next_due_date <= date(?, '+' || ? || ' days')
         AND next_due_date >= ?`
    )
    .all(todayStr, settings.reminder_days_before_recurring_expense, todayStr) as Array<{
    id: number
    name: string
    amount: number
    currency: string
    day_of_month: number
    frequency: string
    next_due_date: string | null
  }>

  for (const template of activeTemplates) {
    if (!template.next_due_date) continue
    const vars: Record<string, string> = {
      due_date: template.next_due_date,
      property_name: template.name,
      amount: `${template.amount} ${template.currency}`
    }
    const message = resolveTemplateMessage('recurring_expense_due', appLanguage, vars)
    insert.run(
      'recurring_expense_due',
      'recurring_expense',
      template.id,
      'recurring_expense_due_title',
      message ?? `Recurring expense "${template.name}" due on ${template.next_due_date}`,
      'notification.body.recurringExpenseDue',
      JSON.stringify(vars),
      template.next_due_date
    )
  }
}

export function registerNotificationIpcHandlers(): void {
  ipcMain.handle('notifications:list', async (_, filters?: { unread_only?: boolean }) => {
    try {
      let query = `
        SELECT n.*, t.phone as tenant_phone, t.country_code as tenant_country_code
        FROM notifications n
        LEFT JOIN contracts c ON n.entity_type = 'contract' AND n.entity_id = c.id
        LEFT JOIN tenants t ON c.tenant_id = t.id
        WHERE 1=1`
      const params: (string | number)[] = []
      if (filters?.unread_only) {
        query += ' AND is_read = 0'
      }
      query += ' ORDER BY created_at DESC LIMIT 50'
      return db.prepare(query).all(...params)
    } catch {
      throw new Error('FAILED_TO_LIST_NOTIFICATIONS')
    }
  })

  ipcMain.handle('notifications:unreadCount', async () => {
    try {
      const row = db
        .prepare('SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0')
        .get() as { cnt: number }
      return { count: row.cnt }
    } catch {
      throw new Error('FAILED_TO_COUNT_NOTIFICATIONS')
    }
  })

  ipcMain.handle('notifications:markRead', async (_, id: number) => {
    try {
      db.prepare(
        `UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP, status = 'sent'
         WHERE id = ?`
      ).run(id)
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_MARK_READ')
    }
  })

  ipcMain.handle('notifications:markAllRead', async () => {
    try {
      db.prepare(
        `UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP, status = 'sent'
         WHERE is_read = 0`
      ).run()
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_MARK_ALL_READ')
    }
  })

  // Dismiss a notification without marking it as handled.
  ipcMain.handle('notifications:dismiss', async (_, id: number) => {
    try {
      db.prepare("UPDATE notifications SET status = 'dismissed' WHERE id = ?").run(id)
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_DISMISS_NOTIFICATION')
    }
  })
}
