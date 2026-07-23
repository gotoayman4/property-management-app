/**
 * @file contractHelpers — Helper functions for contract lifecycle and DB constraints.
 * INTENT: Encapsulates overlap checks, property status sync, and contract history auditing.
 */
import { db } from './database'

/** Check for an active overlapping contract on the same property */
export function checkOverlap(
  propertyId: number,
  startDate: string,
  endDate: string,
  excludeId?: number
): boolean {
  if (excludeId) {
    return !!db
      .prepare(
        `SELECT 1 FROM contracts
    WHERE property_id = ? AND status = 'active' AND is_archived = 0
      AND NOT (end_date < ? OR start_date > ?)
      AND id != ?`
      )
      .get(propertyId, startDate, endDate, excludeId)
  }
  return !!db
    .prepare(
      `SELECT 1 FROM contracts
    WHERE property_id = ? AND status = 'active' AND is_archived = 0
      AND NOT (end_date < ? OR start_date > ?)`
    )
    .get(propertyId, startDate, endDate)
}

/** Sync property status based on whether it has any active contract */
export function syncPropertyStatus(propertyId: number): void {
  const active = db
    .prepare(
      `SELECT 1 FROM contracts WHERE property_id = ? AND status = 'active' AND is_archived = 0`
    )
    .get(propertyId)
  db.prepare('UPDATE properties SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    active ? 'rented' : 'vacant',
    propertyId
  )
}

/** Append a contract_history row (snapshot the current row before a change) */
export function logHistory(
  contractId: number,
  actionType: 'created' | 'renewed' | 'amended' | 'cancelled',
  previousValues: Record<string, unknown> | null,
  note?: string
): void {
  db.prepare(
    `INSERT INTO contract_history (contract_id, action_type, previous_values_json, changed_by_note)
     VALUES (?, ?, ?, ?)`
  ).run(
    contractId,
    actionType,
    previousValues ? JSON.stringify(previousValues) : null,
    note ?? null
  )
}
