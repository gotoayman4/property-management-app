/**
 * @file autoRenewalService — FR-CON-04b launch-time automatic contract renewal.
 *
 * INTENT: On every app launch, renew in place every active, non-archived, flat-mode contract
 *         that is armed for auto-renewal (auto_renew = 1) and whose end_date has passed. The
 *         renewal reuses the exact write shape of the manual `contracts:renew` handler
 *         (contract UPDATE + contract_history snapshot) so auto-renewal is never a divergent
 *         code path.
 *
 * CONSTRAINT (D2): auto-renewal is only valid for flat-mode contracts (has_variable_escalation = 0).
 *             Variable-escalation contracts define their own multi-year plan and are excluded.
 * CONSTRAINT (BR-07): the prior contract row is snapshotted into contract_history with
 *             action_type='renewed' and an "auto-renewed" note so the audit trail is preserved.
 * CONSTRAINT (BR-20/BR-21): writes happen inside db.transaction(). The ledger is NOT touched —
 *             renewal changes contract terms only.
 * DECISION: a lapsed contract is rolled forward consecutively (bounded at MAX_ITERATIONS terms)
 *           so a contract that expired several terms ago lands on a current term in one run.
 * DECISION: term length is preserved via contract_term_years (whole-year shift, no leap drift).
 */

import { Database } from 'better-sqlite3'
import { addYearsISO } from '../utils/dateUtils'
import { logger } from '../utils/logger'
import { resolveTemplateMessage, resolveLanguage } from './notificationEvaluator'

/** Round to 2 decimal places (money). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Upper bound on consecutive roll-forwards for a single lapsed contract. */
const MAX_ITERATIONS = 5

interface DueAutoRenewRow {
  id: number
  property_id: number
  tenant_id: number
  end_date: string
  rent_amount: number
  currency: string
  contract_term_years: number
  auto_renew_increase_percent: number | null
  property_name: string
  tenant_name: string
  tenant_lang: string | null
}

/**
 * Renew all due auto-renew contracts in place. Safe to call multiple times — a contract whose
 * end_date is in the future after renewal is no longer selected.
 *
 * @param db - The better-sqlite3 Database instance (main-process singleton).
 * @returns The number of contracts that were auto-renewed.
 */
export function applyDueAutoRenewals(db: Database): number {
  const today = new Date().toISOString().split('T')[0]

  const settings = db.prepare('SELECT app_language FROM settings WHERE id = 1').get() as
    { app_language: string } | undefined
  const appLanguage = settings?.app_language || 'en'

  // Pre-load templates once (parity with notificationEvaluator's N+1 avoidance).
  const templateRows = db
    .prepare('SELECT trigger_type, language, message_body FROM notification_templates')
    .all() as Array<{ trigger_type: string; language: string; message_body: string }>
  const templateMap = new Map<string, string>()
  for (const row of templateRows) {
    templateMap.set(`${row.trigger_type}:${row.language}`, row.message_body)
  }

  const dueRows = db
    .prepare(
      `SELECT c.id, c.property_id, c.tenant_id, c.end_date, c.rent_amount, c.currency,
              c.contract_term_years, c.auto_renew_increase_percent,
              p.name AS property_name, t.fullname AS tenant_name, t.preferred_language AS tenant_lang
       FROM contracts c
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active'
         AND c.is_archived = 0
         AND c.auto_renew = 1
         AND c.has_variable_escalation = 0
         AND c.end_date <= ?
       ORDER BY c.id`
    )
    .all(today) as DueAutoRenewRow[]

  const insertNotification = db.prepare(`
    INSERT INTO notifications (notification_type, entity_type, entity_id, title, message, message_key, message_vars, due_date)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE notification_type = ? AND entity_type = ? AND entity_id = ? AND due_date = ?
    )
  `)

  let renewed = 0

  for (const row of dueRows) {
    try {
      db.transaction(() => {
        let currentEnd = row.end_date
        let currentRent = row.rent_amount
        let iterations = 0

        while (currentEnd <= today && iterations < MAX_ITERATIONS) {
          const newStart = currentEnd
          const newEnd = addYearsISO(newStart, row.contract_term_years)
          const newRent =
            row.auto_renew_increase_percent != null
              ? round2(currentRent * (1 + row.auto_renew_increase_percent / 100))
              : currentRent

          // Snapshot the prior term into contract_history before overwriting (BR-07).
          db.prepare(
            `INSERT INTO contract_history
               (contract_id, action_type, previous_values_json, changed_by_note)
             VALUES (?, 'renewed', ?, ?)`
          ).run(
            row.id,
            JSON.stringify({
              start_date: newStart,
              end_date: currentEnd,
              rent_amount: currentRent
            }),
            `auto-renewed: ${currentEnd} → ${newEnd}`
          )

          db.prepare(
            `UPDATE contracts SET
               start_date = @start_date, end_date = @end_date, rent_amount = @rent_amount,
               status = 'active', updated_at = CURRENT_TIMESTAMP
             WHERE id = @id`
          ).run({
            id: row.id,
            start_date: newStart,
            end_date: newEnd,
            rent_amount: newRent
          })

          currentEnd = newEnd
          currentRent = newRent
          iterations++
        }

        // Property stays 'rented' (contract remains active) — sync defensively against the same db.
        const hasActive = db
          .prepare(
            `SELECT 1 FROM contracts WHERE property_id = ? AND status = 'active' AND is_archived = 0`
          )
          .get(row.property_id)
        db.prepare(
          'UPDATE properties SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(hasActive ? 'rented' : 'vacant', row.property_id)

        // Notify that the renewal happened — auto-renewal is never silent.
        const vars: Record<string, string> = {
          tenant_name: row.tenant_name,
          property_name: row.property_name,
          due_date: currentEnd,
          rent: `${currentRent} ${row.currency}`
        }
        const lang = resolveLanguage(row.tenant_lang, appLanguage)
        const message = resolveTemplateMessage('contract_auto_renewed', lang, vars, templateMap)
        insertNotification.run(
          'contract_auto_renewed',
          'contract',
          row.id,
          'contract_auto_renewed_title',
          message ?? `Lease for "${row.property_name}" was auto-renewed to ${currentEnd}`,
          'notification.body.contractAutoRenewed',
          JSON.stringify(vars),
          currentEnd,
          'contract_auto_renewed',
          'contract',
          row.id,
          currentEnd
        )
      })()

      renewed++
    } catch (err) {
      logger.error('autoRenewalService', err)
    }
  }

  if (renewed > 0) {
    logger.info('autoRenewalService', `Auto-renewed ${renewed} contract(s) on ${today}.`)
  }

  return renewed
}
