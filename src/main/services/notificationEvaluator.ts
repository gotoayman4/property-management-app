/**
 * @file notificationEvaluator — Evaluates notification triggers on application startup.
 * INTENT: Generates in-app alerts for rent due, overdue payments, contract expiry,
 *         escalation steps, document expiry, recurring expense due, and backup failures.
 *
 * CONSTRAINT: All message bodies are resolved using tenant preferred_language (or app_language).
 */
import { type Database } from 'better-sqlite3'
import { db } from '../db/database'
import { type TriggerType } from './notificationTemplates'

export function resolveTemplateMessage(
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

export function resolveLanguage(
  tenantPrefLang: string | null | undefined,
  appLanguage: string
): string {
  if (tenantPrefLang) return tenantPrefLang
  return appLanguage || 'en'
}

export function evaluateNotifications(dbParam?: Database): void {
  const targetDb = dbParam || db
  const settings = targetDb.prepare('SELECT * FROM settings WHERE id = 1').get() as {
    app_language: string
    reminder_days_before_due: number
    reminder_days_before_contract_end: number
    reminder_days_before_document_expiry: number
    reminder_days_before_recurring_expense: number
  }
  const appLanguage = settings?.app_language || 'en'

  // Pre-load all notification templates in a single query to eliminate N+1 lookup queries
  const templateRows = targetDb
    .prepare('SELECT trigger_type, language, message_body FROM notification_templates')
    .all() as Array<{ trigger_type: string; language: string; message_body: string }>
  const templateMap = new Map<string, string>()
  for (const row of templateRows) {
    templateMap.set(`${row.trigger_type}:${row.language}`, row.message_body)
  }

  targetDb.transaction(() => {
    // 1. Rent Due / Overdue are driven by rent_dues (real receivables) — NOT the contract
    //    end_date proxy. A per-tenant/contract arrears aggregate (months_overdue,
    //    total_outstanding) feeds the enriched template variables and the arrears_summary blast.
    const today = new Date().toISOString().split('T')[0]

    // DECISION: INSERT OR IGNORE + the UNIQUE idx_notifications_dedup index (migration 033) is the
    //           single dedup mechanism. The previous WHERE NOT EXISTS (... is_read = 0) guard let
    //           re-inserts of already-READ rows through, which then hit the unique index and
    //           aborted the WHOLE evaluation transaction on the next launch.
    const insert = targetDb.prepare(`
      INSERT OR IGNORE INTO notifications (notification_type, entity_type, entity_id, title, message, message_key, message_vars, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Per-contract arrears aggregate across all still-open past-due dues (one row per currency;
    // a contract has a single currency so at most one row per contract).
    const arrearsRows = targetDb
      .prepare(
        `SELECT d.contract_id,
                d.currency,
                COUNT(*) AS months_overdue,
                SUM(d.amount_due - d.amount_paid) AS total_outstanding
         FROM rent_dues d
         JOIN contracts c ON d.contract_id = c.id
         WHERE d.status IN ('pending', 'partial') AND d.due_date < ? AND c.is_archived = 0
         GROUP BY d.contract_id, d.currency`
      )
      .all(today) as Array<{
      contract_id: number
      currency: string
      months_overdue: number
      total_outstanding: number
    }>
    const arrearsByContract = new Map<
      number,
      { months_overdue: number; total_outstanding: number; currency: string }
    >()
    for (const row of arrearsRows) {
      arrearsByContract.set(row.contract_id, {
        months_overdue: row.months_overdue,
        total_outstanding: row.total_outstanding,
        currency: row.currency
      })
    }

    const dueRowFields = `d.id AS due_id, d.contract_id, d.period_key, d.due_type, d.due_date,
            d.amount_due, (d.amount_due - d.amount_paid) AS outstanding, d.currency,
            p.name AS property_name, t.fullname AS tenant_name,
            t.preferred_language AS tenant_lang`

    interface DueNotifyRow {
      due_id: number
      contract_id: number
      period_key: string
      due_type: string
      due_date: string
      amount_due: number
      outstanding: number
      currency: string
      property_name: string
      tenant_name: string
      tenant_lang: string | null
    }

    // Build the enriched variable set shared by rent_due / overdue / arrears_summary.
    const buildVars = (d: DueNotifyRow): Record<string, string> => {
      const agg = arrearsByContract.get(d.contract_id)
      return {
        tenant_name: d.tenant_name,
        property_name: d.property_name,
        amount: `${d.amount_due} ${d.currency}`,
        amount_due: `${d.amount_due} ${d.currency}`,
        amount_outstanding: `${d.outstanding} ${d.currency}`,
        period: d.period_key,
        due_date: d.due_date,
        months_overdue: String(agg?.months_overdue ?? 0),
        total_outstanding: `${agg?.total_outstanding ?? d.outstanding} ${d.currency}`
      }
    }

    // 1a. Rent Due — fires ONLY on the exact due day (due_date = today). No advance reminders:
    //     upcoming dues would clutter the list for ordinary users, and if the app isn't opened on
    //     the due day the overdue evaluator (step 2) covers it on the next launch.
    const rentDueDues = targetDb
      .prepare(
        `SELECT ${dueRowFields}
         FROM rent_dues d
         JOIN properties p ON d.property_id = p.id
         JOIN contracts c ON d.contract_id = c.id
         JOIN tenants t ON d.tenant_id = t.id
         WHERE d.status IN ('pending', 'partial') AND d.due_type = 'rent'
           AND d.due_date = ? AND c.is_archived = 0`
      )
      .all(today) as DueNotifyRow[]

    for (const d of rentDueDues) {
      const vars = buildVars(d)
      const lang = resolveLanguage(d.tenant_lang, appLanguage)
      const message = resolveTemplateMessage('rent_due', lang, vars, templateMap)
      insert.run(
        'rent_due',
        'contract',
        d.contract_id,
        'rent_due_title',
        message ?? `Rent due for ${d.property_name}`,
        'notification.body.rentDue',
        JSON.stringify(vars),
        d.due_date
      )
    }

    // 2. Overdue — every open due whose due_date has already passed. Using each due's own
    //    due_date as the notification due_date makes the dedup key period-specific, so multiple
    //    unpaid periods for one contract each surface distinctly. The unread rent_due notification
    //    for the same period (if any) is removed first — ONE live notification per period.
    const deleteStaleRentDue = targetDb.prepare(
      `DELETE FROM notifications
       WHERE notification_type = 'rent_due' AND entity_type = 'contract'
         AND entity_id = ? AND due_date = ? AND is_read = 0`
    )
    const overdueDues = targetDb
      .prepare(
        `SELECT ${dueRowFields}
         FROM rent_dues d
         JOIN properties p ON d.property_id = p.id
         JOIN contracts c ON d.contract_id = c.id
         JOIN tenants t ON d.tenant_id = t.id
         WHERE d.status IN ('pending', 'partial') AND d.due_date < ? AND c.is_archived = 0
         ORDER BY d.due_date ASC`
      )
      .all(today) as DueNotifyRow[]

    for (const d of overdueDues) {
      const vars = buildVars(d)
      const lang = resolveLanguage(d.tenant_lang, appLanguage)
      const message = resolveTemplateMessage('overdue', lang, vars, templateMap)
      deleteStaleRentDue.run(d.contract_id, d.due_date)
      insert.run(
        'overdue',
        'contract',
        d.contract_id,
        'overdue_title',
        message ?? `Rent overdue for ${d.property_name}`,
        'notification.body.overdue',
        JSON.stringify(vars),
        d.due_date
      )
    }

    // 2b. Arrears Summary — one aggregate reminder per contract carrying MULTIPLE open past-due
    //     periods (the migrated pre-app debt case). Deduped on the OLDEST open due_date (stable
    //     across days — deduping on `today` re-created a fresh row every launch, cluttering the
    //     list). Stale unread summaries for the same contract are replaced when that date moves.
    const deleteStaleArrearsSummary = targetDb.prepare(
      `DELETE FROM notifications
       WHERE notification_type = 'arrears_summary' AND entity_type = 'contract'
         AND entity_id = ? AND due_date <> ? AND is_read = 0`
    )
    const arrearsSummaryDues = targetDb
      .prepare(
        `SELECT d.contract_id, MIN(d.due_date) AS due_date, d.currency,
                p.name AS property_name, t.fullname AS tenant_name,
                t.preferred_language AS tenant_lang
         FROM rent_dues d
         JOIN properties p ON d.property_id = p.id
         JOIN contracts c ON d.contract_id = c.id
         JOIN tenants t ON d.tenant_id = t.id
         WHERE d.status IN ('pending', 'partial') AND d.due_date < ? AND c.is_archived = 0
         GROUP BY d.contract_id, d.currency, p.name, t.fullname, t.preferred_language
         HAVING COUNT(*) > 1`
      )
      .all(today) as Array<{
      contract_id: number
      due_date: string
      currency: string
      property_name: string
      tenant_name: string
      tenant_lang: string | null
    }>

    for (const row of arrearsSummaryDues) {
      const agg = arrearsByContract.get(row.contract_id)
      const vars: Record<string, string> = {
        tenant_name: row.tenant_name,
        property_name: row.property_name,
        months_overdue: String(agg?.months_overdue ?? 0),
        total_outstanding: `${agg?.total_outstanding ?? 0} ${row.currency}`,
        due_date: row.due_date
      }
      const lang = resolveLanguage(row.tenant_lang, appLanguage)
      const message = resolveTemplateMessage('arrears_summary', lang, vars, templateMap)
      deleteStaleArrearsSummary.run(row.contract_id, row.due_date)
      insert.run(
        'arrears_summary',
        'contract',
        row.contract_id,
        'arrears_summary_title',
        message ??
          `${row.tenant_name} has ${agg?.months_overdue ?? 0} unpaid periods totaling ${agg?.total_outstanding ?? 0} ${row.currency}`,
        'notification.body.arrearsSummary',
        JSON.stringify(vars),
        row.due_date
      )
    }

    // 3. Contract Expiring
    const contractExpDays = settings.reminder_days_before_contract_end || 30
    const contractExpThreshold = new Date()
    contractExpThreshold.setDate(contractExpThreshold.getDate() + contractExpDays)
    const contractExpStr = contractExpThreshold.toISOString().split('T')[0]

    const expiringContracts = targetDb
      .prepare(
        `SELECT c.id, c.end_date, c.auto_renew, c.has_variable_escalation,
                p.name as property_name, t.fullname as tenant_name, t.preferred_language as tenant_lang
         FROM contracts c
         JOIN properties p ON c.property_id = p.id
         JOIN tenants t ON c.tenant_id = t.id
         WHERE c.status = 'active' AND c.end_date <= ? AND c.end_date >= ? AND c.is_archived = 0`
      )
      .all(contractExpStr, today) as Array<{
      id: number
      end_date: string
      auto_renew: number
      has_variable_escalation: number
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
      // Contracts armed for auto-renewal get a reassuring "will auto-renew" variant instead of
      // the plain expiry warning (only flat-mode contracts can be armed — see AUTO_RENEW_REQUIRES_FLAT).
      const willAutoRenew = contract.auto_renew === 1 && contract.has_variable_escalation === 0
      if (willAutoRenew) {
        const message = resolveTemplateMessage('auto_renew_upcoming', lang, vars, templateMap)
        insert.run(
          'auto_renew_upcoming',
          'contract',
          contract.id,
          'auto_renew_upcoming_title',
          message ??
            `Lease for "${contract.property_name}" will auto-renew on ${contract.end_date}`,
          'notification.body.autoRenewUpcoming',
          JSON.stringify(vars),
          contract.end_date
        )
      } else {
        const message = resolveTemplateMessage('contract_expiring', lang, vars, templateMap)
        insert.run(
          'contract_expiry',
          'contract',
          contract.id,
          'contract_expiring_title',
          message ??
            `Lease contract for "${contract.property_name}" expires on ${contract.end_date}`,
          'notification.body.contractExpiring',
          JSON.stringify(vars),
          contract.end_date
        )
      }
    }

    // 4. Escalation Upcoming
    const escalationThreshold = new Date()
    escalationThreshold.setDate(escalationThreshold.getDate() + 14)
    const escalationThresholdStr = escalationThreshold.toISOString().split('T')[0]

    const upcomingEscalations = targetDb
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
        esc.effective_date
      )
    }

    // 5. Document Expiring
    const docDays = settings.reminder_days_before_document_expiry || 30
    const docThreshold = new Date()
    docThreshold.setDate(docThreshold.getDate() + docDays)
    const docThresholdStr = docThreshold.toISOString().split('T')[0]

    const expiringDocuments = targetDb
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
      // CAVEAT: the notifications CHECK (migration 033) only allows 'document_expiry' — the
      //         'document_expiring' spelling is the TEMPLATE trigger enum. Inserting the template
      //         spelling here violated the CHECK and rolled back the whole evaluation.
      insert.run(
        'document_expiry',
        'document',
        docItem.id,
        'document_expiring_title',
        message ?? `Document "${docItem.name}" expires on ${docItem.expiry_date}`,
        'notification.body.documentExpiring',
        JSON.stringify(vars),
        docItem.expiry_date
      )
    }

    // 6. Recurring Expense Due
    const recDays = settings.reminder_days_before_recurring_expense || 3
    const recThreshold = new Date()
    recThreshold.setDate(recThreshold.getDate() + recDays)
    const recThresholdStr = recThreshold.toISOString().split('T')[0]

    const activeTemplates = targetDb
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
        template.next_due_date
      )
    }

    // 7. Retention: purge dismissed notifications older than 90 days. Recent dismissed rows are
    //    kept so idx_notifications_dedup keeps suppressing re-inserts; a purged row can only be
    //    re-created if its trigger is STILL live (e.g. rent still unpaid), which is intentional.
    targetDb
      .prepare(
        `DELETE FROM notifications WHERE status = 'dismissed' AND created_at < datetime('now', '-90 days')`
      )
      .run()
  })()
}
