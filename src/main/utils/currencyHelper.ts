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
