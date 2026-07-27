/**
 * @file escalationService - FR-CON-11 automatic rent escalation application.
 *
 * INTENT: On every app launch, detect active multi-year contracts whose
 *         rent_escalation_schedule has a past due step that has NOT yet been
 *         applied to contracts.rent_amount, and apply it atomically.
 *
 * CONSTRAINT (BR-16): rent_amount for variable-escalation contracts is always
 *             driven by the schedule - never by the flat annual_increase_percent.
 * CONSTRAINT (BR-07): every programmatic change to contracts.rent_amount MUST
 *             be recorded in contract_history with action_type='amended' and a
 *             descriptive note so the full audit trail is preserved.
 * CONSTRAINT (BR-20/BR-21): writes happen inside db.transaction(). The ledger
 *             is NOT touched here - this is a rent rate update, not a payment.
 * DECISION: Comparing rent_amount with a 0.01 epsilon avoids floating-point
 *           false-positives while still catching real divergence from rounding.
 */

import { Database } from 'better-sqlite3'
import { logger } from '../utils/logger'

interface DueEscalationRow {
  contract_id: number
  year_number: number
  effective_start_date: string
  schedule_rent_amount: number
  current_rent_amount: number
}

/** Floating-point comparison epsilon for rent amounts. */
const EPSILON = 0.01

/**
 * Apply all overdue rent escalation steps to active variable-escalation contracts.
 * Safe to call multiple times - already-applied steps (where rent matches) are skipped.
 *
 * @param db - The better-sqlite3 Database instance (main-process singleton).
 * @returns The number of contracts whose rent_amount was updated.
 */
export function applyDueEscalations(db: Database): number {
  const today = new Date().toISOString().split('T')[0]

  /**
   * For each active variable-escalation contract, find the most recent schedule
   * row whose effective_start_date is on or before today. That is the current
   * escalation step. If the contract rent_amount differs from it, the step
   * has not been applied yet.
   */
  const dueRows = db
    .prepare(
      `SELECT
         c.id            AS contract_id,
         r.year_number,
         r.effective_start_date,
         r.rent_amount   AS schedule_rent_amount,
         c.rent_amount   AS current_rent_amount
       FROM contracts c
       JOIN rent_escalation_schedule r
         ON r.contract_id = c.id
       WHERE c.status        = 'active'
         AND c.is_archived   = 0
         AND c.has_variable_escalation = 1
         AND r.effective_start_date <= ?
         AND r.year_number = (
               SELECT MAX(r2.year_number)
               FROM   rent_escalation_schedule r2
               WHERE  r2.contract_id       = c.id
                 AND  r2.effective_start_date <= ?
             )
       ORDER BY c.id`
    )
    .all(today, today) as DueEscalationRow[]

  let applied = 0

  for (const row of dueRows) {
    if (Math.abs(row.schedule_rent_amount - row.current_rent_amount) < EPSILON) {
      continue
    }

    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE contracts
           SET rent_amount = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(row.schedule_rent_amount, row.contract_id)

        db.prepare(
          `INSERT INTO contract_history
             (contract_id, action_type, previous_values_json, changed_by_note)
           VALUES (?, 'amended', ?, ?)`
        ).run(
          row.contract_id,
          JSON.stringify({ rent_amount: row.current_rent_amount }),
          `Auto-applied escalation Year ${row.year_number} (effective ${row.effective_start_date}): ${row.current_rent_amount} -> ${row.schedule_rent_amount}`
        )
      })()

      applied++
    } catch (err) {
      logger.error('escalationService', err)
    }
  }

  if (applied > 0) {
    logger.info(
      'escalationService',
      `Applied rent escalation to ${applied} contract(s) on ${today}.`
    )
  }

  return applied
}
