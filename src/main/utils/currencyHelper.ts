import { Database } from 'better-sqlite3'
import {
  type ExportLanguage,
  resolveLocaleKey,
  formatNumber
} from '../services/exportService/exportUtils'

/**
 * Shape returned by getLatestRate. Mirrors the exchange_rates row, except for
 * reverse-derived rows where currency_from/currency_to/rate are synthesized to
 * reflect the REQUESTED direction (not the stored direction).
 */
export interface ResolvedRate {
  id?: number
  currency_from: string
  currency_to: string
  rate: number
  effective_date: string
  source: string
  fetched_at: string | null
  /** True when the rate was derived by inverting the stored reverse pair. */
  inferred_from_reverse: boolean
}

/**
 * INTENT: Resolve the latest exchange rate between two currencies, trying the
 *         stored direction first and falling back to the reciprocal pair
 *         (1 / reverse rate) when only the opposite direction exists (BR-15).
 * CONSTRAINT: Never throws on a missing pair — returns null so callers (forms,
 *             reports, dashboard) can surface a graceful "no rate" state.
 * DECISION: Consolidates the direct/reverse lookup that previously lived inline
 *           in both convertAmount and the exchangeRates:latest IPC. One seam,
 *           one set of rules — deduplication per code-organization guidelines.
 * CAVEAT: Reverse-derived rows synthesize currency_from/currency_to/rate to the
 *         requested direction; `inferred_from_reverse` flags these so consumers
 *         can show "(approx)" if they wish. id/effective_date come from the
 *         stored reverse row.
 */
export function getLatestRate(db: Database, from: string, to: string): ResolvedRate | null {
  if (from === to) {
    // Identity — represent as a rate of 1 with a synthetic row. effective_date
    // is irrelevant for identity; use a stable placeholder.
    return {
      currency_from: from,
      currency_to: to,
      rate: 1,
      effective_date: new Date().toISOString().split('T')[0],
      source: 'identity',
      fetched_at: null,
      inferred_from_reverse: false
    }
  }

  // Try direct rate
  const directRow = db
    .prepare(
      `SELECT id, currency_from, currency_to, rate, effective_date, source, fetched_at
       FROM exchange_rates
       WHERE currency_from = ? AND currency_to = ?
       ORDER BY effective_date DESC, fetched_at DESC
       LIMIT 1`
    )
    .get(from, to) as Omit<ResolvedRate, 'inferred_from_reverse'> | undefined

  if (directRow && directRow.rate > 0) {
    return { ...directRow, inferred_from_reverse: false }
  }

  // Try reverse rate — synthesize the requested direction
  const reverseRow = db
    .prepare(
      `SELECT id, currency_from, currency_to, rate, effective_date, source, fetched_at
       FROM exchange_rates
       WHERE currency_from = ? AND currency_to = ?
       ORDER BY effective_date DESC, fetched_at DESC
       LIMIT 1`
    )
    .get(to, from) as Omit<ResolvedRate, 'inferred_from_reverse'> | undefined

  if (reverseRow && reverseRow.rate > 0) {
    return {
      id: reverseRow.id,
      currency_from: from,
      currency_to: to,
      rate: 1 / reverseRow.rate,
      effective_date: reverseRow.effective_date,
      source: reverseRow.source,
      fetched_at: reverseRow.fetched_at,
      inferred_from_reverse: true
    }
  }

  return null
}

/**
 * INTENT: Helper for multi-currency conversion with direct & reverse rate derivation (BR-15).
 *         If both are missing, returns 'rate_missing' sentinel.
 * DECISION: Delegates to getLatestRate so all callers share one resolution rule.
 */
export function convertAmount(
  db: Database,
  amount: number,
  from: string,
  to: string
): number | 'rate_missing' {
  if (from === to) return amount

  const rate = getLatestRate(db, from, to)
  if (!rate || rate.rate <= 0) {
    return 'rate_missing'
  }
  return amount * rate.rate
}

/** Snapshot written to payments/expenses/ledger_entries at transaction time. */
export interface ReportingSnapshot {
  /** The reporting currency this snapshot was resolved against (settings.reporting_currency). */
  reportingCurrency: string
  /** Frozen exchange rate: 1 unit of `currency` = `exchangeRate` units of `reportingCurrency`. */
  exchangeRate: number
  /** amount * exchangeRate, in reporting currency. */
  baseAmount: number
}

/**
 * INTENT: Read the configured reporting currency from settings (singleton id=1). The single
 *         seam every report builder / dashboard / snapshot helper uses so the default is
 *         consistent everywhere.
 * CONSTRAINT: Never throws — returns the provided default on any error so callers don't have
 *             to wrap every call in try/catch.
 */
export function getReportingCurrency(db: Database, fallback = 'JOD'): string {
  try {
    const row = db.prepare('SELECT reporting_currency FROM settings WHERE id = 1').get() as
      { reporting_currency: string } | undefined
    return row?.reporting_currency || fallback
  } catch {
    return fallback
  }
}

/**
 * INTENT: Resolve the reporting-currency snapshot for a monetary amount at the moment a
 *         transaction is written, so reports are deterministic and immune to later rate
 *         changes (BR-13: the ledger still records the transaction's own currency; this
 *         snapshot is an ADDITIONAL frozen fact used only for consolidation).
 * CONSTRAINT: Never throws. Returns null when no rate can be resolved for the pair — the
 *             caller writes NULL for all three snapshot columns and reports fall back to
 *             the native amount (graceful degradation).
 * DECISION: Reads settings.reporting_currency (default 'JOD' for pre-settings DBs), then
 *           delegates to getLatestRate so the direct/reverse rule is identical to the
 *           runtime/UI lookup. Identity (amount already in reporting currency) yields
 *           exchangeRate = 1 and baseAmount = amount.
 */
export function resolveReportingSnapshot(
  db: Database,
  amount: number,
  currency: string
): ReportingSnapshot | null {
  const reportingCurrency = getReportingCurrency(db)
  const rate = getLatestRate(db, currency, reportingCurrency)
  if (!rate || rate.rate <= 0) {
    return null
  }
  return {
    reportingCurrency,
    exchangeRate: rate.rate,
    baseAmount: amount * rate.rate
  }
}

/**
 * INTENT: Build the consolidated-total note for a report. Two modes:
 *         - default (groups carry native-currency totals): convert each group via convertAmount.
 *         - preConverted=true (groups already summed in reporting currency via base_amount
 *           snapshots): skip conversion and just add the totals.
 * CONSTRAINT: When preConverted, ALL groups are assumed to already be in reporting currency
 *             (mixed-currency grouping with NULL snapshots falls back to native currency for
 *             those rows — those groups are NOT reporting currency and must not use this mode).
 * DECISION: preConverted exists so P&L / Property Profitability reports, which now aggregate
 *           SUM(COALESCE(base_amount, amount)), can show a single consolidated total without
 *           double-converting or re-deriving rates against today's latest values.
 */
export function computeConsolidatedNote(
  db: Database,
  groups: { currency: string; totals: Record<string, number> }[],
  sumKey: string,
  options?: { preConverted?: boolean; lang?: ExportLanguage }
): string | undefined {
  if (groups.length <= 1) return undefined

  const targetCurrency = getReportingCurrency(db)
  const lang = options?.lang ?? 'ar'

  let totalSum = 0
  const missingPairs: string[] = []

  for (const group of groups) {
    const val = Number(group.totals[sumKey] ?? 0)
    if (options?.preConverted) {
      // Group total is already in reporting currency — do not re-convert.
      totalSum += val
    } else {
      const converted = convertAmount(db, val, group.currency, targetCurrency)
      if (converted === 'rate_missing') {
        missingPairs.push(`${group.currency} -> ${targetCurrency}`)
      } else {
        totalSum += converted
      }
    }
  }

  if (missingPairs.length > 0) {
    return `${resolveLocaleKey('reports.consolidatedTotal', lang)} (${targetCurrency}): ${resolveLocaleKey('reports.rateMissingFor', lang)} ${missingPairs.join(', ')}`
  }

  const suffix = options?.preConverted
    ? resolveLocaleKey('reports.frozenSnapshotNote', lang)
    : resolveLocaleKey('reports.convertedUsingLatest', lang)

  return `${resolveLocaleKey('reports.consolidatedTotal', lang)}: ${formatNumber(totalSum, lang)} ${targetCurrency} ${suffix}`
}

/**
 * Result of a snapshot-aware consolidated sum over a date-windowed set of transactions.
 * - `total`: sum of `COALESCE(base_amount, amount)` across all matched rows, grouped by
 *   `COALESCE(reporting_currency, currency)`. Each group is added to `total` once. Rows whose
 *   snapshot is NULL contribute their native `amount` (graceful fallback) and are surfaced in
 *   `unconvertedCurrencies` so the report can footnote them.
 * - `currency`: the reporting currency rows were consolidated into (read from settings).
 * - `unconvertedCurrencies`: distinct native currencies that had no snapshot and were added at
 *   face value. Empty when every row had a snapshot.
 */
export interface ConsolidatedSnapshotTotal {
  total: number
  currency: string
  unconvertedCurrencies: string[]
}

/**
 * INTENT: Sum the reporting-currency snapshot across payments and/or expenses in a date window,
 *         producing the deterministic consolidated total that previously was re-derived from
 *         today's latest rate. Rows frozen at their write-time rate stay at that rate forever.
 * CONSTRAINT: Only non-voided rows are summed (is_voided = 0). Voids already contribute their
 *             negated snapshot via their own reversal rows, so they are correctly excluded here
 *             to avoid double-counting (the original row is also excluded by is_voided = 1).
 * CONSTRAINT: When a row's base_amount is NULL (no rate existed at write time), its native
 *             `amount` is added to the total AND its currency is recorded in
 *             `unconvertedCurrencies` — graceful degradation, never silent and never blocking.
 * DECISION: This is the single seam for snapshot-based consolidation. Reports and the dashboard
 *           call it instead of convertAmount/computeConsolidatedNote so the "frozen rate" rule
 *           lives in exactly one query.
 */
export function sumReportingSnapshot(
  db: Database,
  options: {
    table: 'payments' | 'expenses'
    dateColumn: string
    fromDate?: string
    toDate?: string
    /** Optional JOIN clause, e.g. `LEFT JOIN properties pr ON payments.property_id = pr.id`. */
    join?: string
    extraWhere?: string
    params?: Record<string, unknown>
  }
): ConsolidatedSnapshotTotal {
  const reportingCurrency = getReportingCurrency(db)

  const params: Record<string, unknown> = { ...options.params }
  const conditions = [`${options.table}.is_voided = 0`]
  if (options.fromDate) {
    conditions.push(`${options.table}.${options.dateColumn} >= @fromDate`)
    params.fromDate = options.fromDate
  }
  if (options.toDate) {
    conditions.push(`${options.table}.${options.dateColumn} <= @toDate`)
    params.toDate = options.toDate
  }
  if (options.extraWhere) {
    conditions.push(options.extraWhere)
  }

  // One row per (reporting_currency|currency) group. base_amount NULL falls back to amount
  // and is flagged via `unconverted_count` so we can footnote the unconverted currencies.
  const joinClause = options.join ? ` ${options.join}` : ''
  const groupedRows = db
    .prepare(
      `SELECT
         COALESCE(${options.table}.reporting_currency, ${options.table}.currency) AS group_currency,
         SUM(COALESCE(${options.table}.base_amount, ${options.table}.amount, 0)) AS subtotal,
         SUM(CASE WHEN ${options.table}.base_amount IS NULL THEN 1 ELSE 0 END) AS unconverted_count
       FROM ${options.table}${joinClause}
       WHERE ${conditions.join(' AND ')}
       GROUP BY group_currency`
    )
    .all(params) as Array<{
    group_currency: string
    subtotal: number
    unconverted_count: number
  }>

  let total = 0
  const unconvertedCurrencies: string[] = []
  for (const g of groupedRows) {
    total += Number(g.subtotal ?? 0)
    if (g.unconverted_count > 0 && g.group_currency !== reportingCurrency) {
      unconvertedCurrencies.push(g.group_currency)
    }
  }

  return { total, currency: reportingCurrency, unconvertedCurrencies }
}

/**
 * INTENT: Format a ConsolidatedSnapshotTotal as a human-readable report footnote. Mirrors the
 *         shape of computeConsolidatedNote's output so the UI needs no special-casing.
 */
export function formatConsolidatedSnapshotNote(
  snap: ConsolidatedSnapshotTotal,
  lang: ExportLanguage = 'ar'
): string {
  const total = formatNumber(snap.total, lang)
  const frozenNote = resolveLocaleKey('reports.frozenSnapshotNote', lang)
  if (snap.unconvertedCurrencies.length > 0) {
    return `${resolveLocaleKey('reports.consolidatedTotal', lang)}: ${total} ${snap.currency} (${frozenNote}; ${snap.unconvertedCurrencies.join(', ')} ${resolveLocaleKey('reports.hadNoSnapshot', lang)})`
  }
  return `${resolveLocaleKey('reports.consolidatedTotal', lang)}: ${total} ${snap.currency} (${frozenNote})`
}
