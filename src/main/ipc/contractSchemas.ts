/**
 * @file contractSchemas — Zod validation schemas for contract IPC operations.
 * INTENT: Enforces boundary validation on all incoming contract payload objects.
 */
import { z } from 'zod'

/**
 * INTENT: Auto-renewal is only meaningful for flat-mode contracts. Variable-escalation contracts
 *         carry their own multi-year plan, so arming auto-renew on them is rejected at the boundary
 *         (mirrored by the disabled toggle in the UI). Shared by create / update / renew.
 */
const rejectAutoRenewOnVariable = (d: {
  auto_renew?: number
  has_variable_escalation?: number
}): boolean => !(d.auto_renew === 1 && d.has_variable_escalation === 1)
const AUTO_RENEW_REFINE = {
  message: 'AUTO_RENEW_REQUIRES_FLAT',
  path: ['auto_renew']
}

// CAVEAT: fields + payment_frequency/status enums are aligned to the actual contracts table
// (migration 014) and the renderer payload. Zod strips unknown keys, so any column referenced by
// the INSERT/UPDATE that is missing here would surface as a "Missing named parameter" at runtime.
export const contractCreateSchema = z
  .object({
    contract_number: z.string().min(1).max(50),
    property_id: z.number().int().positive(),
    tenant_id: z.number().int().positive(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rent_amount: z.number().positive(),
    currency: z.string().min(3).max(3),
    payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'semi_annual', 'annual']),
    security_deposit: z.number().min(0).default(0),
    status: z.enum(['draft', 'active', 'expired', 'renewing', 'cancelled']).default('active'),
    contract_term_years: z.number().int().min(1).max(20).default(1),
    has_variable_escalation: z.number().int().min(0).max(1).default(0),
    annual_increase_percent: z.number().min(0).max(100).optional().nullable(),
    payment_method: z.string().optional().nullable(),
    auto_renew: z.number().int().min(0).max(1).default(0),
    auto_renew_increase_percent: z.number().min(0).max(100).optional().nullable(),
    notes: z.string().optional().nullable()
  })
  .refine(rejectAutoRenewOnVariable, AUTO_RENEW_REFINE)

export const contractUpdateSchema = z
  .object({
    id: z.number().int().positive(),
    contract_number: z.string().min(1).max(50),
    property_id: z.number().int().positive(),
    tenant_id: z.number().int().positive(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rent_amount: z.number().positive(),
    currency: z.string().min(3).max(3),
    payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'semi_annual', 'annual']),
    security_deposit: z.number().min(0).default(0),
    status: z.enum(['draft', 'active', 'expired', 'renewing', 'cancelled']).default('active'),
    contract_term_years: z.number().int().min(1).max(20).default(1),
    has_variable_escalation: z.number().int().min(0).max(1).default(0),
    annual_increase_percent: z.number().min(0).max(100).optional().nullable(),
    payment_method: z.string().optional().nullable(),
    auto_renew: z.number().int().min(0).max(1).default(0),
    auto_renew_increase_percent: z.number().min(0).max(100).optional().nullable(),
    notes: z.string().optional().nullable()
  })
  .refine(rejectAutoRenewOnVariable, AUTO_RENEW_REFINE)

export const contractRenewSchema = z
  .object({
    contract_id: z.number().int().positive(),
    new_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    new_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rent_amount: z.number().positive(),
    security_deposit: z.number().nonnegative().default(0.0),
    has_variable_escalation: z.number().int().min(0).max(1),
    contract_term_years: z.number().int().min(1).max(20),
    annual_increase_percent: z.number().min(0).max(100).optional().nullable(),
    // Manual renewal may amend these; falls back to the prior values in the handler when omitted.
    payment_frequency: z
      .enum(['monthly', 'quarterly', 'semi-annual', 'semi_annual', 'annual'])
      .optional(),
    payment_method: z.string().optional().nullable(),
    auto_renew: z.number().int().min(0).max(1).default(0),
    auto_renew_increase_percent: z.number().min(0).max(100).optional().nullable(),
    schedule: z
      .array(
        z.object({
          year_number: z.number().int().positive(),
          effective_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          rent_amount: z.number().positive(),
          increase_percent_applied: z.number().min(0).max(100).optional().nullable(),
          notes: z.string().optional().nullable()
        })
      )
      .optional(),
    notes: z.string().optional().nullable()
  })
  .refine(rejectAutoRenewOnVariable, AUTO_RENEW_REFINE)

export const escalationSetSchema = z.object({
  contract_id: z.number().int().positive(),
  schedule: z
    .array(
      z.object({
        year_number: z.number().int().positive(),
        effective_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rent_amount: z.number().positive(),
        increase_percent_applied: z.number().min(0).max(100).optional().nullable(),
        notes: z.string().optional().nullable()
      })
    )
    .min(1)
})
