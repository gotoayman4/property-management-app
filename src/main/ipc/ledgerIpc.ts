import { ipcMain } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'
import {
  computeRunningBalances,
  computeSummary,
  computeSummaryReporting,
  reconstructBalanceAsOf,
  appendLedgerEntry,
  LedgerError
} from '../db/ledgerService'
import type { ExportLanguage } from '../services/exportService/exportUtils'

/**
 * INTENT: IPC handlers for the Financial Ledger screen (SRS §5.15, §9.8).
 * CONSTRAINT: All reads are pure SELECTs. The only write path is the manual-adjustment handler,
 *             which appends a manual_adjustment ledger row (FR-LED-04). The ledger is append-only;
 *             there is no UPDATE/DELETE handler here or anywhere.
 */

function readLanguage(): ExportLanguage {
  try {
    const row = db.prepare('SELECT app_language FROM settings WHERE id = 1').get() as
      { app_language?: string } | undefined
    if (row?.app_language === 'en') return 'en'
  } catch {
    // Default to Arabic on missing settings
  }
  return 'ar'
}

const ledgerListSchema = z.object({
  property_id: z.number().int().positive(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
})

const ledgerSummarySchema = ledgerListSchema.extend({
  /** When true, totals are returned in the configured reporting currency via base_amount. */
  reporting_currency: z.boolean().optional()
})

const reconstructSchema = z.object({
  property_id: z.number().int().positive(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reporting_currency: z.boolean().optional()
})

// SRS §13: manual-adjustment description must be 5–500 characters.
const manualAdjustmentSchema = z.object({
  property_id: z.number().int().positive(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(5, 'DESCRIPTION_TOO_SHORT').max(500, 'DESCRIPTION_TOO_LONG'),
  amount: z.number().refine((n) => n !== 0, 'AMOUNT_REQUIRED'),
  /** Positive = debit (balance increase), negative = credit (balance decrease). */
  currency: z.string().min(3).max(3)
})

export function registerLedgerIpcHandlers(): void {
  ipcMain.handle('ledger:list', async (_, payload: unknown) => {
    try {
      const v = ledgerListSchema.parse(payload)
      return computeRunningBalances(db, v.property_id, v.from_date, v.to_date, readLanguage())
    } catch (error: unknown) {
      console.error('Error listing ledger:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_LEDGER')
    }
  })

  ipcMain.handle('ledger:summary', async (_, payload: unknown) => {
    try {
      const v = ledgerSummarySchema.parse(payload)
      // When the caller requests reporting-currency mode, sum the frozen base_amount snapshot
      // instead of native debit/credit. The Ledger page toggle uses this to switch views.
      return v.reporting_currency
        ? computeSummaryReporting(db, v.property_id, v.from_date, v.to_date)
        : computeSummary(db, v.property_id, v.from_date, v.to_date)
    } catch (error: unknown) {
      console.error('Error computing ledger summary:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_SUMMARIZE_LEDGER')
    }
  })

  ipcMain.handle('ledger:reconstructBalance', async (_, payload: unknown) => {
    try {
      const v = reconstructSchema.parse(payload)
      return {
        balance: reconstructBalanceAsOf(
          db,
          v.property_id,
          v.as_of_date,
          v.reporting_currency ?? false
        )
      }
    } catch (error: unknown) {
      console.error('Error reconstructing balance:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_RECONSTRUCT_BALANCE')
    }
  })

  ipcMain.handle('ledger:addManualAdjustment', async (_, payload: unknown) => {
    try {
      const v = manualAdjustmentSchema.parse(payload)
      // Confirm the property exists before writing.
      const property = db
        .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
        .get(v.property_id) as { currency: string } | undefined
      if (!property) throw new Error('PROPERTY_NOT_FOUND')

      const id = db.transaction(() =>
        appendLedgerEntry(db, {
          entryDate: v.entry_date,
          entryType: 'manual_adjustment',
          referenceType: 'manual',
          referenceId: null,
          propertyId: v.property_id,
          description: v.description,
          // Positive amount => debit (inflow), negative => credit (outflow).
          debit: v.amount > 0 ? v.amount : 0,
          credit: v.amount < 0 ? Math.abs(v.amount) : 0,
          currency: v.currency,
          isManualAdjustment: true
        })
      )()
      return { id }
    } catch (error: unknown) {
      console.error('Error adding manual adjustment:', error)
      if (error instanceof LedgerError) throw new Error(error.message)
      if (error instanceof z.ZodError) {
        // Surface the specific validation code so the UI can map it to a field error.
        throw new Error(error.issues[0]?.message ?? 'INVALID_INPUT')
      }
      throw new Error('FAILED_TO_ADD_MANUAL_ADJUSTMENT')
    }
  })
}
