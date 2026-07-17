/**
 * INTENT: Exchange rate IPC — list, add, get latest rate for currency conversion.
 *         Manual entry is the primary flow. Online fetch (ADR-001) is a convenience
 *         button, not a dependency.
 * CONSTRAINT (ADR-001): online fetch uses Electron net.fetch(), user-initiated only.
 * CONSTRAINT (BR-13): conversion is display-only; ledger always records in base currency.
 */
import { ipcMain, net } from 'electron'
import { db } from '../db/database'
import { z } from 'zod'

const rateAddSchema = z.object({
  currency_from: z.string().min(3).max(3),
  currency_to: z.string().min(3).max(3),
  rate: z.number().positive(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(['manual', 'online']).default('manual'),
  entered_by_note: z.string().max(200).optional()
})

const ratePairSchema = z.object({
  currency_from: z.string().min(3).max(3),
  currency_to: z.string().min(3).max(3)
})

export function registerExchangeRateIpcHandlers(): void {
  // List all exchange rates, optionally filtered by pair
  ipcMain.handle(
    'exchangeRates:list',
    async (_, filters?: { currency_from?: string; currency_to?: string }) => {
      try {
        let query = 'SELECT * FROM exchange_rates'
        const conditions: string[] = []
        const params: string[] = []

        if (filters?.currency_from) {
          conditions.push('currency_from = ?')
          params.push(filters.currency_from)
        }
        if (filters?.currency_to) {
          conditions.push('currency_to = ?')
          params.push(filters.currency_to)
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ')
        }
        query += ' ORDER BY effective_date DESC, fetched_at DESC'

        return db.prepare(query).all(...params)
      } catch {
        throw new Error('FAILED_TO_LIST_RATES')
      }
    }
  )

  // Get the latest rate for a specific pair (most recent effective_date)
  ipcMain.handle('exchangeRates:latest', async (_, data: unknown) => {
    try {
      const parsed = ratePairSchema.parse(data)
      const row = db
        .prepare(
          `SELECT * FROM exchange_rates
           WHERE currency_from = ? AND currency_to = ?
           ORDER BY effective_date DESC, fetched_at DESC
           LIMIT 1`
        )
        .get(parsed.currency_from, parsed.currency_to)
      return row ?? null
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw new Error('FAILED_TO_GET_LATEST_RATE')
    }
  })

  // Add a new exchange rate (manual entry)
  ipcMain.handle('exchangeRates:add', async (_, data: unknown) => {
    try {
      const parsed = rateAddSchema.parse(data)

      // Upsert: if a rate exists for the same pair+date, update it
      const existing = db
        .prepare(
          'SELECT id FROM exchange_rates WHERE currency_from = ? AND currency_to = ? AND effective_date = ?'
        )
        .get(parsed.currency_from, parsed.currency_to, parsed.effective_date) as
        { id: number } | undefined

      if (existing) {
        db.prepare(
          `UPDATE exchange_rates SET rate = ?, source = ?, fetched_at = CURRENT_TIMESTAMP,
           entered_by_note = ? WHERE id = ?`
        ).run(parsed.rate, parsed.source, parsed.entered_by_note ?? null, existing.id)
        return { id: existing.id, upserted: true }
      }

      const result = db
        .prepare(
          `INSERT INTO exchange_rates (currency_from, currency_to, rate, effective_date, source, fetched_at, entered_by_note)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`
        )
        .run(
          parsed.currency_from,
          parsed.currency_to,
          parsed.rate,
          parsed.effective_date,
          parsed.source,
          parsed.entered_by_note ?? null
        )
      return { id: result.lastInsertRowid, upserted: false }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      throw new Error('FAILED_TO_ADD_RATE')
    }
  })

  // Fetch latest rate from a public API (ADR-001 exception — user-initiated only)
  ipcMain.handle('exchangeRates:fetchOnline', async (_, data: unknown) => {
    try {
      const parsed = ratePairSchema.parse(data)

      // ADR-001: using Electron net.fetch, not axios or global fetch
      const url = `https://open.er-api.com/v6/latest/${parsed.currency_from}`
      const response = await net.fetch(url)

      if (!response.ok) {
        throw new Error('NETWORK_ERROR')
      }

      const body = (await response.json()) as {
        result?: string
        rates?: Record<string, number>
      }

      if (body.result !== 'success' || !body.rates) {
        throw new Error('API_ERROR')
      }

      const rate = body.rates[parsed.currency_to]
      if (!rate || rate <= 0) {
        throw new Error('PAIR_NOT_FOUND')
      }

      return {
        currency_from: parsed.currency_from,
        currency_to: parsed.currency_to,
        rate,
        effective_date: new Date().toISOString().split('T')[0],
        source: 'online' as const
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      if (error instanceof Error && error.message === 'PAIR_NOT_FOUND') {
        throw error
      }
      // Network or API failure — degrade gracefully per ADR-001
      throw new Error('FETCH_FAILED_ONLINE_UNAVAILABLE')
    }
  })
}
