import { ipcMain } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'
import {
  getArrearsSummary,
  getOutstandingDues,
  listDuesByContract,
  settleDuesBeforeApp,
  waiveDue
} from '../db/duesAllocation'
import {
  createOpeningBalanceDue,
  deleteOpeningBalanceDue,
  DuesError,
  updateOpeningBalanceDue
} from '../db/duesGeneration'
import { logger } from '../utils/logger'
import {
  createOpeningBalanceSchema,
  deleteOpeningBalanceSchema,
  listByContractSchema,
  listOutstandingSchema,
  settleBeforeAppSchema,
  summarySchema,
  updateOpeningBalanceSchema,
  waiveSchema
} from './duesSchemas'

/**
 * INTENT: IPC handlers for the rent-dues (receivables) domain — channels use domain:verb.
 * CONSTRAINT: Reads go straight to duesAllocation queries; mutations (settle/waive/opening
 *             balance) NEVER write ledger rows (that money predates the app or was forgiven).
 *             Zod validates at the boundary; DuesError codes surface to the renderer verbatim.
 */
export function registerDuesIpcHandlers(): void {
  ipcMain.handle('dues:listByContract', async (_, data: unknown) => {
    try {
      const contractId = listByContractSchema.parse(data)
      return listDuesByContract(db, contractId)
    } catch (error: unknown) {
      logger.error('Error listing dues by contract', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_DUES')
    }
  })

  ipcMain.handle('dues:listOutstanding', async (_, data: unknown) => {
    try {
      const filters = listOutstandingSchema.parse(data) ?? {}
      return getOutstandingDues(db, filters)
    } catch (error: unknown) {
      logger.error('Error listing outstanding dues', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_DUES')
    }
  })

  ipcMain.handle('dues:summary', async (_, data: unknown) => {
    try {
      const parsed = summarySchema.parse(data)
      return getArrearsSummary(db, parsed?.country)
    } catch (error: unknown) {
      logger.error('Error building arrears summary', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_SUMMARIZE_DUES')
    }
  })

  ipcMain.handle('dues:settleBeforeApp', async (_, data: unknown) => {
    try {
      const v = settleBeforeAppSchema.parse(data)
      const changed = settleDuesBeforeApp(db, v.due_ids, v.note)
      return { changed }
    } catch (error: unknown) {
      logger.error('Error settling dues before app', error)
      if (error instanceof DuesError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_SETTLE_DUES')
    }
  })

  ipcMain.handle('dues:waive', async (_, data: unknown) => {
    try {
      const v = waiveSchema.parse(data)
      const changed = waiveDue(db, v.due_id, v.reason)
      return { changed }
    } catch (error: unknown) {
      logger.error('Error waiving due', error)
      if (error instanceof DuesError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_WAIVE_DUE')
    }
  })

  ipcMain.handle('dues:createOpeningBalance', async (_, data: unknown) => {
    try {
      const v = createOpeningBalanceSchema.parse(data)
      return createOpeningBalanceDue(db, {
        contract_id: v.contract_id,
        amount: v.amount,
        as_of_date: v.as_of_date,
        note: v.note ?? null
      })
    } catch (error: unknown) {
      logger.error('Error creating opening balance due', error)
      if (error instanceof DuesError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_CREATE_OPENING_BALANCE')
    }
  })

  ipcMain.handle('dues:updateOpeningBalance', async (_, data: unknown) => {
    try {
      const v = updateOpeningBalanceSchema.parse(data)
      return updateOpeningBalanceDue(db, {
        due_id: v.due_id,
        amount: v.amount,
        as_of_date: v.as_of_date,
        note: v.note ?? null
      })
    } catch (error: unknown) {
      logger.error('Error updating opening balance due', error)
      if (error instanceof DuesError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_UPDATE_OPENING_BALANCE')
    }
  })

  ipcMain.handle('dues:deleteOpeningBalance', async (_, data: unknown) => {
    try {
      const v = deleteOpeningBalanceSchema.parse(data)
      return deleteOpeningBalanceDue(db, v.due_id)
    } catch (error: unknown) {
      logger.error('Error deleting opening balance due', error)
      if (error instanceof DuesError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_DELETE_OPENING_BALANCE')
    }
  })
}
