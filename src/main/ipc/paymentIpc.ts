import { ipcMain } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'
import {
  createPayment,
  voidPayment,
  listPayments,
  PaymentError,
  type CreatePaymentInput
} from '../db/paymentRepository'

const isDev = process.env.NODE_ENV !== 'production'

/**
 * INTENT: IPC handlers for the payments (income) domain — channels use the domain:verb convention.
 * CONSTRAINT: All writes go through paymentRepository which wraps payment+ledger in ONE transaction
 *             (BR-21) and enforces the property-currency lock (BR-13). Zod validates at the boundary.
 */

const paymentCreateSchema = z.object({
  contract_id: z.number().int().positive().optional().nullable(),
  property_id: z.number().int().positive(),
  tenant_id: z.number().int().positive().optional().nullable(),
  payment_type: z.enum(['rent', 'deposit', 'other_income']),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  payment_method: z.string().max(50).optional().nullable(),
  is_partial: z.boolean().default(false),
  related_period_month: z
    .string()
    // Accepts a single YYYY-MM or a comma-separated list e.g. "2026-01,2026-02,2026-03"
    .regex(/^\d{4}-\d{2}(,\d{4}-\d{2})*$/)
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
  custom_exchange_rate: z.number().positive().optional().nullable()
})

const paymentListFiltersSchema = z
  .object({
    property_id: z.number().int().positive().optional(),
    tenant_id: z.number().int().positive().optional(),
    contract_id: z.number().int().positive().optional(),
    from_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    payment_type: z.enum(['rent', 'deposit', 'other_income']).optional()
  })
  .optional()

const paymentVoidSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1).max(500)
})

export function registerPaymentIpcHandlers(): void {
  ipcMain.handle('payments:list', async (_, filters?: unknown) => {
    try {
      const parsed = paymentListFiltersSchema.parse(filters)
      return listPayments(db, parsed)
    } catch (error: unknown) {
      if (isDev) console.error('Error listing payments:', error)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_PAYMENTS')
    }
  })

  ipcMain.handle('payments:get', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      return db
        .prepare(
          `SELECT pay.*, p.name AS property_name, p.code AS property_code,
                  t.fullname AS tenant_fullname, t.code AS tenant_code
           FROM payments pay
           LEFT JOIN properties p ON pay.property_id = p.id
           LEFT JOIN tenants t ON pay.tenant_id = t.id
           WHERE pay.id = ?`
        )
        .get(id)
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (isDev) console.error('Error getting payment:', error)
      throw new Error('FAILED_TO_GET_PAYMENT')
    }
  })

  ipcMain.handle('payments:create', async (_, data: unknown) => {
    try {
      const v = paymentCreateSchema.parse(data)
      // Enforce BR-13: lock the payment currency to the linked property's currency.
      const property = db
        .prepare('SELECT currency FROM properties WHERE id = ? AND is_archived = 0')
        .get(v.property_id) as { currency: string } | undefined
      if (!property) throw new Error('PROPERTY_NOT_FOUND')

      const input: CreatePaymentInput = {
        ...v,
        property_currency: property.currency,
        is_partial: v.is_partial,
        contract_id: v.contract_id ?? null,
        tenant_id: v.tenant_id ?? null,
        payment_method: v.payment_method ?? null,
        related_period_month: v.related_period_month ?? null,
        notes: v.notes ?? null,
        custom_exchange_rate: v.custom_exchange_rate ?? null
      }
      return createPayment(db, input)
    } catch (error: unknown) {
      if (isDev) console.error('Error creating payment:', error)
      if (error instanceof PaymentError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw error
    }
  })

  ipcMain.handle('payments:void', async (_, payload: unknown) => {
    try {
      const v = paymentVoidSchema.parse(payload)
      return voidPayment(db, v.id, v.reason)
    } catch (error: unknown) {
      console.error('Error voiding payment:', error)
      if (error instanceof PaymentError) throw new Error(error.message)
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_VOID_PAYMENT')
    }
  })
}
