/**
 * @file Zod schemas for the rent-dues IPC boundary.
 *
 * INTENT: Centralize input validation for the dues domain so duesIpc.ts stays focused on
 *         handler registration/orchestration (mirrors recurringExpenseSchemas / contractSchemas).
 * CONSTRAINT: Every schema matches the shape sent by the renderer preload bridge; dates are
 *             strict YYYY-MM-DD and ids are positive integers.
 */
import { z } from 'zod'

const idSchema = z.number().int().positive()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** dues:listByContract — all dues (any status) for one contract. */
export const listByContractSchema = idSchema

/** dues:listOutstanding — paginated, filterable open-dues query. */
export const listOutstandingSchema = z
  .object({
    contract_id: idSchema.optional(),
    property_id: idSchema.optional(),
    tenant_id: idSchema.optional(),
    only_overdue: z.boolean().optional()
  })
  .optional()
  .nullable()

/** dues:summary — per-currency arrears aging, optionally scoped to one country. */
export const summarySchema = z
  .object({ country: z.string().max(100).optional() })
  .optional()
  .nullable()

/** dues:settleBeforeApp — bulk "collected before the app" with a required audit note. */
export const settleBeforeAppSchema = z.object({
  due_ids: z.array(idSchema).min(1),
  note: z.string().min(1).max(500)
})

/** dues:waive — forgive a single due with a required reason. */
export const waiveSchema = z.object({
  due_id: idSchema,
  reason: z.string().min(1).max(500)
})

/** dues:createOpeningBalance — lump-sum migrated arrears for a contract. */
export const createOpeningBalanceSchema = z.object({
  contract_id: idSchema,
  amount: z.number().positive(),
  as_of_date: isoDate,
  note: z.string().max(500).optional().nullable()
})

/** dues:updateOpeningBalance — correct amount/date/note on a never-collected opening balance. */
export const updateOpeningBalanceSchema = z.object({
  due_id: idSchema,
  amount: z.number().positive(),
  as_of_date: isoDate,
  note: z.string().max(500).optional().nullable()
})

/** dues:deleteOpeningBalance — remove a never-collected opening balance (data-entry mistake). */
export const deleteOpeningBalanceSchema = z.object({
  due_id: idSchema
})
