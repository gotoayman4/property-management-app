import { Database } from 'better-sqlite3'

/**
 * INTENT: Helper for multi-currency conversion with direct & reverse rate derivation (BR-15).
 *         If both are missing, returns 'rate_missing' sentinel.
 */
export function convertAmount(
  db: Database,
  amount: number,
  from: string,
  to: string
): number | 'rate_missing' {
  if (from === to) return amount

  // Try direct rate
  const directRow = db
    .prepare(
      `SELECT rate FROM exchange_rates
       WHERE currency_from = ? AND currency_to = ?
       ORDER BY effective_date DESC, fetched_at DESC
       LIMIT 1`
    )
    .get(from, to) as { rate: number } | undefined

  if (directRow && directRow.rate > 0) {
    return amount * directRow.rate
  }

  // Try reverse rate
  const reverseRow = db
    .prepare(
      `SELECT rate FROM exchange_rates
       WHERE currency_from = ? AND currency_to = ?
       ORDER BY effective_date DESC, fetched_at DESC
       LIMIT 1`
    )
    .get(to, from) as { rate: number } | undefined

  if (reverseRow && reverseRow.rate > 0) {
    return amount * (1 / reverseRow.rate)
  }

  return 'rate_missing'
}

export function computeConsolidatedNote(
  db: Database,
  groups: { currency: string; totals: Record<string, number> }[],
  sumKey: string
): string | undefined {
  if (groups.length <= 1) return undefined

  let targetCurrency = 'JOD'
  try {
    const row = db.prepare('SELECT reporting_currency FROM settings WHERE id = 1').get() as
      { reporting_currency: string } | undefined
    if (row?.reporting_currency) targetCurrency = row.reporting_currency
  } catch {
    // default to JOD
  }

  let totalSum = 0
  const missingPairs: string[] = []

  for (const group of groups) {
    const val = Number(group.totals[sumKey] ?? 0)
    const converted = convertAmount(db, val, group.currency, targetCurrency)
    if (converted === 'rate_missing') {
      missingPairs.push(`${group.currency} -> ${targetCurrency}`)
    } else {
      totalSum += converted
    }
  }

  if (missingPairs.length > 0) {
    return `Consolidated Total (${targetCurrency}): Rate missing for ${missingPairs.join(', ')}`
  }

  return `Consolidated Total: ${totalSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${targetCurrency} (Converted using latest saved rates)`
}
