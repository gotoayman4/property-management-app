import { Database } from 'better-sqlite3'
import { toLocalISODate } from '../utils/dateUtils'

/**
 * @file duesGeneration — materialize a contract's expected rent obligations (rent_dues).
 *
 * INTENT: Turn a contract (start/end/frequency/rent + optional escalation schedule) into one
 *         `rent_dues` row per billing period. This is the receivables backbone: the app can
 *         then compare what is OWED (dues) against what was COLLECTED (payments) to derive
 *         arrears — without ever polluting the cash-basis ledger.
 *
 * CONSTRAINTS:
 *   - Generation is IDEMPOTENT: `INSERT OR IGNORE` on UNIQUE(contract_id, due_type, period_key)
 *     means re-running (at every app launch) never duplicates a period.
 *   - Escalation-aware: when a contract has a rent_escalation_schedule, each period's amount is
 *     the schedule rent effective on that period's start date; otherwise the flat rent_amount.
 *   - Backdated contracts: because periods are derived from the REAL start_date, a contract that
 *     began before the app was adopted materializes its full historical due schedule at once,
 *     surfacing the accumulated arrears the owner already carries.
 *   - Never touches settled/paid rows: regenerateFutureDues only rewrites FUTURE pending rows.
 *
 * DECISION: `db` is injected (not the singleton) so the pure period math is unit-testable on an
 *           in-memory DB, mirroring contractEscalation.ts / recurringSchedule.ts.
 */

/** A contract row shape (subset) needed to generate dues. */
interface ContractForDues {
  id: number
  property_id: number
  tenant_id: number | null
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  payment_frequency: string
  has_variable_escalation: number
}

/** A single generated period before persistence. */
interface DuePeriod {
  period_key: string
  period_start: string
  period_end: string
  due_date: string
  amount_due: number
}

/** Map a contract payment_frequency to the number of months each billing period spans. */
export function monthsPerPeriod(frequency: string): number {
  switch (frequency) {
    case 'monthly':
      return 1
    case 'quarterly':
      return 3
    case 'semi_annual':
    case 'semi-annual':
      return 6
    case 'annual':
      return 12
    default:
      return 1
  }
}

/**
 * Add `months` to a YYYY-MM-DD anchor using LOCAL calendar fields (no UTC drift). The anchor's
 * day-of-month is preserved where possible; JS clamps overflow (e.g. Jan 31 + 1mo => Mar 3),
 * but because every period is computed from the ORIGINAL anchor (i * step) rather than
 * compounding, drift never accumulates.
 */
function addMonthsLocal(anchorISO: string, months: number): string {
  const d = new Date(anchorISO + 'T00:00:00')
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth() + months, d.getDate()))
}

/** Subtract one day from a YYYY-MM-DD string (LOCAL), used for inclusive period_end. */
function dayBefore(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))
}

/** Round to 2 decimals to avoid floating-point noise on rent amounts. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compute every billing period for a contract from start_date to end_date (inclusive of the
 * final partial period). Pure — no DB access, no escalation applied yet.
 */
export function computePeriods(contract: ContractForDues): Omit<DuePeriod, 'amount_due'>[] {
  const step = monthsPerPeriod(contract.payment_frequency)
  const periods: Omit<DuePeriod, 'amount_due'>[] = []
  const end = contract.end_date

  for (let i = 0; ; i++) {
    const periodStart = addMonthsLocal(contract.start_date, i * step)
    if (periodStart > end) break
    const nextStart = addMonthsLocal(contract.start_date, (i + 1) * step)
    // Inclusive end = day before the next period start, capped at the contract end_date.
    const rawEnd = dayBefore(nextStart)
    const periodEnd = rawEnd > end ? end : rawEnd
    periods.push({
      period_key: periodStart.slice(0, 7),
      period_start: periodStart,
      period_end: periodEnd,
      due_date: periodStart
    })
    // Safety bound: a 20-year monthly contract is 240 periods; stop well beyond any real term.
    if (i > 600) break
  }
  return periods
}

/**
 * Resolve the rent amount effective on a given date from a contract's escalation schedule.
 * Returns the schedule rent whose effective_start_date is the latest one <= `onDate`, or the
 * flat contract rent when the contract has no variable escalation / no matching schedule row.
 */
function resolveAmountForDate(db: Database, contract: ContractForDues, onDate: string): number {
  if (contract.has_variable_escalation !== 1) return contract.rent_amount
  const row = db
    .prepare(
      `SELECT rent_amount FROM rent_escalation_schedule
       WHERE contract_id = ? AND effective_start_date <= ?
       ORDER BY effective_start_date DESC LIMIT 1`
    )
    .get(contract.id, onDate) as { rent_amount: number } | undefined
  return row ? row.rent_amount : contract.rent_amount
}

/** Load the contract fields needed for dues generation, or null when not found. */
function loadContract(db: Database, contractId: number): ContractForDues | null {
  const c = db
    .prepare(
      `SELECT id, property_id, tenant_id, start_date, end_date, rent_amount, currency,
              payment_frequency, has_variable_escalation
       FROM contracts WHERE id = ?`
    )
    .get(contractId) as ContractForDues | undefined
  return c ?? null
}

/**
 * Generate (idempotently) all rent due rows for a single contract across its full term.
 * Safe to call repeatedly — existing periods are preserved via INSERT OR IGNORE. Returns the
 * number of NEW due rows inserted.
 */
export function generateDuesForContract(db: Database, contractId: number): number {
  const contract = loadContract(db, contractId)
  if (!contract) return 0

  const periods = computePeriods(contract)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO rent_dues
       (contract_id, property_id, tenant_id, due_type, period_key, period_start, period_end,
        due_date, amount_due, amount_paid, currency, status)
     VALUES
       (@contract_id, @property_id, @tenant_id, 'rent', @period_key, @period_start, @period_end,
        @due_date, @amount_due, 0, @currency, 'pending')`
  )

  let inserted = 0
  const run = db.transaction(() => {
    for (const p of periods) {
      const amount = round2(resolveAmountForDate(db, contract, p.period_start))
      const res = insert.run({
        contract_id: contract.id,
        property_id: contract.property_id,
        tenant_id: contract.tenant_id,
        period_key: p.period_key,
        period_start: p.period_start,
        period_end: p.period_end,
        due_date: p.due_date,
        amount_due: amount,
        currency: contract.currency
      })
      inserted += res.changes
    }
  })
  run()
  return inserted
}

/**
 * Rolling generation for all active contracts — invoked at app launch (mirrors the escalation
 * apply step). Materializes any periods that have come due since the last run and backfills dues
 * for contracts created before the dues engine existed. Idempotent.
 */
export function extendDuesForActiveContracts(db: Database): number {
  const contracts = db
    .prepare(`SELECT id FROM contracts WHERE status = 'active' AND is_archived = 0`)
    .all() as Array<{ id: number }>
  let total = 0
  for (const c of contracts) total += generateDuesForContract(db, c.id)
  return total
}

/**
 * Regenerate only FUTURE, still-pending due rows after a contract edit/renewal changed rent,
 * frequency, or end_date. Never touches rows that are paid/partial/settled_before_app/waived, or
 * any row whose period_start is on/before today — those reflect real history. Returns the number
 * of future pending rows rewritten.
 */
export function regenerateFutureDues(db: Database, contractId: number): number {
  const contract = loadContract(db, contractId)
  if (!contract) return 0
  const today = toLocalISODate(new Date())

  const run = db.transaction(() => {
    // Drop future rows that are still pending (untouched by any payment) so they can be rebuilt
    // from the amended contract terms. Past/settled/paid/partial rows are left intact.
    db.prepare(
      `DELETE FROM rent_dues
       WHERE contract_id = ? AND due_type = 'rent' AND status = 'pending' AND period_start > ?`
    ).run(contractId, today)
    return generateDuesForContract(db, contractId)
  })
  return run()
}

/**
 * Create a single lump-sum opening-balance due for users who only know the TOTAL owed at
 * adoption time, not the per-month breakdown (requirement 4). Represented as a due_type
 * 'opening_balance' row so it flows through the same arrears/report/notification pipeline.
 * NEVER writes a ledger entry (it is not cash). Throws DUE_AMOUNT_INVALID on non-positive amount.
 */
export function createOpeningBalanceDue(
  db: Database,
  input: { contract_id: number; amount: number; as_of_date: string; note?: string | null }
): { due_id: number } {
  if (input.amount <= 0) throw new DuesError('DUE_AMOUNT_INVALID')
  const contract = loadContract(db, input.contract_id)
  if (!contract) throw new DuesError('CONTRACT_NOT_FOUND')

  const res = db
    .prepare(
      `INSERT INTO rent_dues
         (contract_id, property_id, tenant_id, due_type, period_key, period_start, period_end,
          due_date, amount_due, amount_paid, currency, status, status_reason, status_changed_at)
       VALUES
         (@contract_id, @property_id, @tenant_id, 'opening_balance', 'opening', @as_of_date,
          @as_of_date, @as_of_date, @amount, 0, @currency, 'pending', @note, CURRENT_TIMESTAMP)`
    )
    .run({
      contract_id: contract.id,
      property_id: contract.property_id,
      tenant_id: contract.tenant_id,
      as_of_date: input.as_of_date,
      amount: round2(input.amount),
      currency: contract.currency,
      note: input.note ?? null
    })
  return { due_id: Number(res.lastInsertRowid) }
}

/** Domain error thrown by dues helpers; carries a machine-readable code for the IPC layer. */
export class DuesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuesError'
  }
}
