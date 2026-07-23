/**
 * @file notificationEvaluator — Evaluates notification triggers on application startup.
 * INTENT: Generates in-app alerts for rent due, overdue payments, contract expiry,
 *         escalation steps, document expiry, recurring expense due, and backup failures.
 *
 * CONSTRAINT: All message bodies are resolved using tenant preferred_language (or app_language).
 */
import { db } from '../db/database'
import { type TriggerType } from './notificationTemplates'

function resolveTemplateMessage(
  triggerType: TriggerType,
  language: string,
  vars: Record<string, string>,
  templateMap?: Map<string, string>
): string | null {
  let body: string | undefined
  if (templateMap) {
    body = templateMap.get(`${triggerType}:${language}`)
  } else {
    const template = db
      .prepare(
        `SELECT message_body FROM notification_templates
         WHERE trigger_type = ? AND language = ?
         LIMIT 1`
      )
      .get(triggerType, language) as { message_body: string } | undefined
    body = template?.message_body
  }

  if (!body) return null

  for (const [key, value] of Object.entries(vars)) {
    body = body.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return body
}

function resolveLanguage(tenantPrefLang: string | null | undefined, appLanguage: string): string {
  if (tenantPrefLang) return tenantPrefLang
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

  // Pre-load all notification templates in a single query to eliminate N+1 lookup queries
  const templateRows = db
    .prepare('SELECT trigger_type, language, message_body FROM notification_templates')
    .all() as Array<{ trigger_type: string; language: string; message_body: string }>
  const templateMap = new Map<string, string>()
  for (const row of templateRows) {
    templateMap.set(`${row.trigger_type}:${row.language}`, row.message_body)
  }

  db.transaction(() => {
    // 1. Rent Due (contracts active, end_date >= today, next payment within N days)
    const today = new Date().toISOString().split('T')[0]

    const rentDueContracts = db
      .prepare(
        `SELECT c.id, c.start_date, c.end_date, c.rent_amount, c.currency, c.tenant_id,
                p.name as property_name, t.fullname as tenant_name, t.preferred_language as tenant_lang
         FROM contracts c
         JOIN properties p ON c.property_id = p.id
         JOIN tenants t ON c.tenant_id = t.id
         WHERE c.status = 'active' AND c.end_date >= ? AND c.is_archived = 0`
      )
      .all(today) as Array<{
      id: number
      start_date: string
      end_date: string
      rent_amount: number
      currency: string
      tenant_id: number
      property_name: string
      tenant_name: string
      tenant_lang: string | null
    }>

    const insert = db.prepare(`
      INSERT INTO notifications (notification_type, entity_type, entity_id, title, message, message_key, message_vars, due_date)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE notification_type = ? AND entity_type = ? AND entity_id = ? AND due_date = ? AND is_read = 0
      )
    `)

    for (const contract of rentDueContracts) {
      const vars: Record<string, string> = {
        tenant_name: contract.tenant_name,
        property_name: contract.property_name,
        amount: `${contract.rent_amount} ${contract.currency}`,
        due_date: contract.end_date
      }
      const lang = resolveLanguage(contract.tenant_lang, appLanguage)
      const message = resolveTemplateMessage('rent_due', lang, vars, templateMap)
      insert.run(
        'rent_due',
        'contract',
        contract.id,
        'rent_due_title',
        message ?? `Rent due for ${contract.property_name}`,
        'notification.body.rentDue',
        JSON.stringify(vars),
        contract.end_date,
        'rent_due',
        'contract',
        contract.id,
        contract.end_date
      )
    }

    // 2. Overdue Payments
    const overdueContracts = db
      .prepare(
        `SELECT c.id, c.end_date, c.rent_amount, c.currency, c.tenant_id,
                p.name as property_name, t.fullname as tenant_name, t.preferred_language as tenant_lang
         FROM contracts c
         JOIN properties p ON c.property_id = p.id
         JOIN tenants t ON c.tenant_id = t.id
         WHERE c.status = 'active' AND c.end_date < ? AND c.is_archived = 0`
      )
      .all(today) as Array<{
      id: number
      end_date: string
      rent_amount: number
      currency: string
      tenant_id: number
      property_name: string
      tenant_name: string
      tenant_lang: string | null
    }>

    for (const contract of overdueContracts) {
      const vars: Record<string, string> = {
        tenant_name: contract.tenant_name,
        property_name: contract.property_name,
        amount: `${contract.rent_amount} ${contract.currency}`,
        due_date: contract.end_date
      }
      const lang = resolveLanguage(contract.tenant_lang, appLanguage)
      const message = resolveTemplateMessage('overdue', lang, vars, templateMap)
      insert.run(
        'overdue',
        'contract',
        contract.id,
        'overdue_title',
        message ?? `Rent overdue for ${contract.property_name}`,
        'notification.body.overdue',
        JSON.stringify(vars),
        contract.end_date,
        'overdue',
        'contract',
        contract.id,
        contract.end_date
      )
    }

    // 3. Contract Expiring
    const contractExpDays = settings.reminder_days_before_contract_end || 30
    const contractExpThreshold = new Date()
    contractExpThreshold.setDate(contractExpThreshold.getDate() + contractExpDays)
    const contractExpStr = contractExpThreshold.toISOString().split('T')[0]

    const expiringContracts = db
      .prepare(
        `SELECT c.id, c.end_date, p.name as property_name, t.fullname as tenant_name, t.preferred_language as tenant_lang
         FROM contracts c
         JOIN properties p ON c.property_id = p.id
         JOIN tenants t ON c.tenant_id = t.id
         WHERE c.status = 'active' AND c.end_date <= ? AND c.end_date >= ? AND c.is_archived = 0`
      )
      .all(contractExpStr, today) as Array<{
      id: number
      end_date: string
      property_name: string
      tenant_name: string
      tenant_lang: string | null
    }>

    for (const contract of expiringContracts) {
      const vars: Record<string, string> = {
        tenant_name: contract.tenant_name,
        property_name: contract.property_name,
        due_date: contract.end_date
      }
      const lang = resolveLanguage(contract.tenant_lang, appLanguage)
      const message = resolveTemplateMessage('contract_expiring', lang, vars, templateMap)
      insert.run(
        'contract_expiry',
        'contract',
        contract.id,
        'contract_expiring_title',
        message ?? `Lease contract for "${contract.property_name}" expires on ${contract.end_date}`,
        'notification.body.contractExpiring',
        JSON.stringify(vars),
        contract.end_date,
        'contract_expiry',
        'contract',
        contract.id,

        contract.end_date
      )
    }

    // 4. Escalation Upcoming
    const escalationThreshold = new Date()
    escalationThreshold.setDate(escalationThreshold.getDate() + 14)
    const escalationThresholdStr = escalationThreshold.toISOString().split('T')[0]

    const upcomingEscalations = db
      .prepare(
        `SELECT s.id, s.contract_id, s.effective_start_date AS effective_date, s.rent_amount AS new_rent_amount,
                p.name as property_name, t.fullname as tenant_name, t.preferred_language as tenant_lang
         FROM rent_escalation_schedule s
         JOIN contracts c ON s.contract_id = c.id
         JOIN properties p ON c.property_id = p.id
         JOIN tenants t ON c.tenant_id = t.id
         WHERE s.effective_start_date <= ? AND s.effective_start_date >= ? AND c.is_archived = 0 AND c.status = 'active'`
      )
      .all(escalationThresholdStr, today) as Array<{
      id: number
      contract_id: number
      effective_date: string
      new_rent_amount: number
      property_name: string
      tenant_name: string
      tenant_lang: string | null
    }>

    for (const esc of upcomingEscalations) {
      const vars: Record<string, string> = {
        tenant_name: esc.tenant_name,
        property_name: esc.property_name,
        due_date: esc.effective_date
      }
      const lang = resolveLanguage(esc.tenant_lang, appLanguage)
      const message = resolveTemplateMessage('escalation_upcoming', lang, vars, templateMap)
      insert.run(
        'escalation_upcoming',
        'contract',
        esc.contract_id,
        'escalation_upcoming_title',
        message ??
          `Rent escalation for "${esc.property_name}" takes effect on ${esc.effective_date}`,
        'notification.body.escalationUpcoming',
        JSON.stringify(vars),
        esc.effective_date,
        'escalation_upcoming',
        'contract',
        esc.contract_id,
        esc.effective_date
      )
    }

    // 5. Document Expiring
    const docDays = settings.reminder_days_before_document_expiry || 30
    const docThreshold = new Date()
    docThreshold.setDate(docThreshold.getDate() + docDays)
    const docThresholdStr = docThreshold.toISOString().split('T')[0]

    const expiringDocuments = db
      .prepare(
        `SELECT id, file_name AS name, COALESCE(document_type, mime_type) AS type, expiry_date
         FROM documents
         WHERE expiry_date IS NOT NULL AND expiry_date <= ? AND expiry_date >= ?`
      )
      .all(docThresholdStr, today) as Array<{
      id: number
      name: string
      type: string
      expiry_date: string
    }>

    for (const docItem of expiringDocuments) {
      const vars: Record<string, string> = {
        document_name: docItem.name,
        document_type: docItem.type,
        expiry_date: docItem.expiry_date
      }
      const message = resolveTemplateMessage('document_expiring', appLanguage, vars, templateMap)
      insert.run(
        'document_expiring',
        'document',
        docItem.id,
        'document_expiring_title',
        message ?? `Document "${docItem.name}" expires on ${docItem.expiry_date}`,
        'notification.body.documentExpiring',
        JSON.stringify(vars),
        docItem.expiry_date,
        'document_expiring',
        'document',
        docItem.id,
        docItem.expiry_date
      )
    }

    // 6. Recurring Expense Due
    const recDays = settings.reminder_days_before_recurring_expense || 3
    const recThreshold = new Date()
    recThreshold.setDate(recThreshold.getDate() + recDays)
    const recThresholdStr = recThreshold.toISOString().split('T')[0]

    const activeTemplates = db
      .prepare(
        `SELECT id, name, amount, currency, day_of_month, frequency, next_due_date
         FROM recurring_expense_templates
         WHERE is_active = 1 AND next_due_date IS NOT NULL AND next_due_date <= ? AND next_due_date >= ?`
      )
      .all(recThresholdStr, today) as Array<{
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
        amount: `${template.amount} ${template.currency}`,
        expense_category: template.name
      }
      const message = resolveTemplateMessage(
        'recurring_expense_due',
        appLanguage,
        vars,
        templateMap
      )
      insert.run(
        'recurring_expense_due',
        'recurring_expense',
        template.id,
        'recurring_expense_due_title',
        message ?? `Recurring expense "${template.name}" due on ${template.next_due_date}`,
        'notification.body.recurringExpenseDue',
        JSON.stringify(vars),
        template.next_due_date,
        'recurring_expense_due',
        'recurring_expense',
        template.id,
        template.next_due_date
      )
    }
  })()
}
