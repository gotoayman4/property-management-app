import { Database } from 'better-sqlite3'
import { toLocalISODate } from '../utils/dateUtils'
import { DuesError } from './duesGeneration'

/**
 * @file duesAllocation — apply payments to rent dues, reverse on void, and query arrears.
 *
 * INTENT: Keep the receivables side (rent_dues) in sync with the cash side (payments) WITHOUT
 *         ever writing to the ledger. When a rent payment is recorded, this module marks the
 *         matching due period(s) as paid/partial and records exactly how much was applied
 *         (due_payment_allocations) so a later void can reverse precisely.
 *
 * CONSTRAINTS:
 *   - Only rent payments tied to a contract allocate; deposits/other_income never touch dues.
 *   - Allocation prefers the period(s) the payment explicitly covers (related_period_month),
 *     then spills over FIFO to the oldest still-open dues (arrears-first), including any
 *     opening_balance row. Overpayment beyond all open dues is left unallocated (the cash is
 *     still recorded by the payment itself).
 *   - settle/waive transitions require an audit note and NEVER create ledger rows — that money
 *     either predates the app or was forgiven; it is not income.
 *
 * DECISION: `db` injected; every function assumes it runs inside the caller's transaction when
 *           mutating (createPayment/voidPayment already open one), so no nested transaction here.
 */

/** Minimal payment shape needed to allocate against dues (subset of a payments row). */
export interface PaymentForAllocation {
  payment_id: number
  contract_id?: number | null
  payment_type: string
  amount: number
  related_period_month?: string | null
}

/** Epsilon for float comparison of money amounts (2-decimal currency). */
const EPS = 0.005

/** Derive a due's status from its paid/owed amounts (open rows only — never for settled/waived). */
function statusFor(amountPaid: number, amountDue: number): 'pending' | 'partial' | 'paid' {
  if (amountPaid >= amountDue - EPS) return 'paid'
  if (amountPaid > EPS) return 'partial'
  return 'pending'
}

interface OpenDueRow {
  id: number
  period_key: string
  amount_due: number
  amount_paid: number
}

/** Apply `amount` to a single due row, writing the allocation and updating status. Returns applied. */
function applyToDue(db: Database, due: OpenDueRow, paymentId: number, amount: number): number {
  const remainingOnDue = due.amount_due - due.amount_paid
  if (remainingOnDue <= EPS || amount <= EPS) return 0
  const applied = Math.min(remainingOnDue, amount)
  const newPaid = Math.round((due.amount_paid + applied) * 100) / 100
  db.prepare(
    `UPDATE rent_dues SET amount_paid = ?, status = ?, status_changed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(newPaid, statusFor(newPaid, due.amount_due), due.id)
  db.prepare(
    `INSERT INTO due_payment_allocations (due_id, payment_id, amount) VALUES (?, ?, ?)`
  ).run(due.id, paymentId, applied)
  due.amount_paid = newPaid
  return applied
}

/**
 * Allocate a rent payment to its contract's dues. Called INSIDE createPayment's transaction so
 * the payment, its ledger row, and the dues update are one atomic unit (BR-21). No-op for
 * non-rent payments or payments without a contract.
 */
export function allocatePaymentToDues(db: Database, payment: PaymentForAllocation): void {
  if (payment.payment_type !== 'rent' || !payment.contract_id) return
  let remaining = payment.amount

  // 1. Targeted allocation: periods the payment explicitly covers, in the given order.
  if (payment.related_period_month) {
    const periods = payment.related_period_month
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    for (const periodKey of periods) {
      if (remaining <= EPS) break
      const due = db
        .prepare(
          `SELECT id, period_key, amount_due, amount_paid FROM rent_dues
           WHERE contract_id = ? AND period_key = ? AND status IN ('pending', 'partial')
           ORDER BY due_date ASC LIMIT 1`
        )
        .get(payment.contract_id, periodKey) as OpenDueRow | undefined
      if (due) remaining -= applyToDue(db, due, payment.payment_id, remaining)
    }
  }

  // 2. Spillover: apply anything left to the oldest still-open dues (arrears-first, FIFO),
  //    including any opening_balance row.
  if (remaining > EPS) {
    const openDues = db
      .prepare(
        `SELECT id, period_key, amount_due, amount_paid FROM rent_dues
         WHERE contract_id = ? AND status IN ('pending', 'partial')
         ORDER BY due_date ASC, id ASC`
      )
      .all(payment.contract_id) as OpenDueRow[]
    for (const due of openDues) {
      if (remaining <= EPS) break
      remaining -= applyToDue(db, due, payment.payment_id, remaining)
    }
  }
}

/**
 * Reverse every allocation made by a voided payment. Called INSIDE voidPayment's transaction.
 * Subtracts each recorded allocation from its due, recomputes the due status, and removes the
 * allocation rows. Never resurrects settled/waived rows (they were not allocated to).
 */
export function reverseAllocations(db: Database, paymentId: number): void {
  const allocations = db
    .prepare(`SELECT due_id, amount FROM due_payment_allocations WHERE payment_id = ?`)
    .all(paymentId) as Array<{ due_id: number; amount: number }>
  if (allocations.length === 0) return

  for (const alloc of allocations) {
    const due = db
      .prepare(`SELECT id, amount_due, amount_paid, status FROM rent_dues WHERE id = ?`)
      .get(alloc.due_id) as
      { id: number; amount_due: number; amount_paid: number; status: string } | undefined
    if (!due) continue
    const newPaid = Math.max(0, Math.round((due.amount_paid - alloc.amount) * 100) / 100)
    db.prepare(
      `UPDATE rent_dues SET amount_paid = ?, status = ?, status_changed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(newPaid, statusFor(newPaid, due.amount_due), due.id)
  }
  db.prepare(`DELETE FROM due_payment_allocations WHERE payment_id = ?`).run(paymentId)
}

/**
 * Bulk-mark dues as collected BEFORE the app was adopted (migration workflow). No ledger rows
 * are written — this money predates the app. Only open (pending/partial) rows transition.
 * Requires a non-empty note. Returns the number of rows changed.
 */
export function settleDuesBeforeApp(db: Database, dueIds: number[], note: string): number {
  const trimmed = note?.trim() ?? ''
  if (trimmed.length === 0) throw new DuesError('DUE_NOTE_REQUIRED')
  if (dueIds.length === 0) return 0

  const stmt = db.prepare(
    `UPDATE rent_dues
       SET status = 'settled_before_app', status_reason = ?, status_changed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('pending', 'partial')`
  )
  let changed = 0
  const run = db.transaction(() => {
    for (const id of dueIds) changed += stmt.run(trimmed, id).changes
  })
  run()
  return changed
}

/** Waive (forgive) a single due. Requires a reason; writes no ledger row. */
export function waiveDue(db: Database, dueId: number, reason: string): number {
  const trimmed = reason?.trim() ?? ''
  if (trimmed.length === 0) throw new DuesError('DUE_NOTE_REQUIRED')
  return db
    .prepare(
      `UPDATE rent_dues
         SET status = 'waived', status_reason = ?, status_changed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('pending', 'partial')`
    )
    .run(trimmed, dueId).changes
}

/** Filters for reading dues. */
export interface DuesQueryFilters {
  contract_id?: number
  property_id?: number
  tenant_id?: number
  only_overdue?: boolean
}

/**
 * List still-open dues (outstanding = amount_due - amount_paid > 0), newest debt context first.
 * When `only_overdue` is set, restricts to periods whose due_date has already passed.
 */
export function getOutstandingDues(db: Database, filters: DuesQueryFilters = {}): unknown[] {
  const today = toLocalISODate(new Date())
  const params: Record<string, unknown> = { today }
  let where = `d.status IN ('pending', 'partial')`
  if (filters.contract_id) {
    where += ' AND d.contract_id = @contract_id'
    params.contract_id = filters.contract_id
  }
  if (filters.property_id) {
    where += ' AND d.property_id = @property_id'
    params.property_id = filters.property_id
  }
  if (filters.tenant_id) {
    where += ' AND d.tenant_id = @tenant_id'
    params.tenant_id = filters.tenant_id
  }
  if (filters.only_overdue) where += ' AND d.due_date < @today'

  return db
    .prepare(
      `SELECT d.id, d.contract_id, d.property_id, d.tenant_id, d.due_type, d.period_key,
              d.period_start, d.period_end, d.due_date, d.amount_due, d.amount_paid,
              (d.amount_due - d.amount_paid) AS outstanding, d.currency, d.status,
              CAST(julianday(@today) - julianday(d.due_date) AS INTEGER) AS days_overdue,
              pr.name AS property_name, c.contract_number, t.fullname AS tenant_name
         FROM rent_dues d
         JOIN properties pr ON d.property_id = pr.id
         JOIN contracts c ON d.contract_id = c.id
         LEFT JOIN tenants t ON d.tenant_id = t.id
        WHERE ${where}
        ORDER BY d.due_date ASC, d.id ASC`
    )
    .all(params)
}

/** List every due (any status) for a contract — the per-period dues ledger view. */
export function listDuesByContract(db: Database, contractId: number): unknown[] {
  const today = toLocalISODate(new Date())
  return db
    .prepare(
      `SELECT d.*, (d.amount_due - d.amount_paid) AS outstanding,
              CAST(julianday(?) - julianday(d.due_date) AS INTEGER) AS days_overdue
         FROM rent_dues d
        WHERE d.contract_id = ?
        ORDER BY d.due_date ASC, d.id ASC`
    )
    .all(today, contractId)
}

/**
 * Aggregate outstanding arrears per currency with aging buckets (0-30 / 31-60 / 61-90 / 90+
 * days past due). Includes dues dated today (age 0 — lands in the 0-30 bucket) so a freshly
 * added opening balance is counted immediately. Optional country filter narrows to one
 * country's properties (dashboard tab).
 */
export function getArrearsSummary(db: Database, country?: string): unknown[] {
  const today = toLocalISODate(new Date())
  const params: unknown[] = [today, today, today, today, today]
  let clause = ''
  if (country) {
    clause = ' AND pr.country = ?'
    params.push(country)
  }
  return db
    .prepare(
      `SELECT d.currency,
              SUM(d.amount_due - d.amount_paid) AS total_outstanding,
              SUM(CASE WHEN julianday(?) - julianday(d.due_date) <= 30
                       THEN d.amount_due - d.amount_paid ELSE 0 END) AS bucket_0_30,
              SUM(CASE WHEN julianday(?) - julianday(d.due_date) BETWEEN 31 AND 60
                       THEN d.amount_due - d.amount_paid ELSE 0 END) AS bucket_31_60,
              SUM(CASE WHEN julianday(?) - julianday(d.due_date) BETWEEN 61 AND 90
                       THEN d.amount_due - d.amount_paid ELSE 0 END) AS bucket_61_90,
              SUM(CASE WHEN julianday(?) - julianday(d.due_date) > 90
                       THEN d.amount_due - d.amount_paid ELSE 0 END) AS bucket_90_plus
         FROM rent_dues d
         JOIN properties pr ON d.property_id = pr.id
        WHERE d.status IN ('pending', 'partial') AND d.due_date <= ?${clause}
        GROUP BY d.currency
        ORDER BY d.currency`
    )
    .all(...params)
}
