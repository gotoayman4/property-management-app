/**
 * @file contractSchemas — Zod validation schemas for contract IPC operations.
 * INTENT: Enforces boundary validation on all incoming contract payload objects.
 */
import { z } from 'zod'

export const contractCreateSchema = z.object({
  contract_number: z.string().min(1).max(50),
  property_id: z.number().int().positive(),
  tenant_id: z.number().int().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rent_amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  payment_frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual', 'one_time']),
  deposit_amount: z.number().min(0).default(0),
  deposit_currency: z.string().min(3).max(3).optional().nullable(),
  terms: z.string().optional().nullable(),
  status: z.enum(['active', 'draft', 'expired', 'terminated']).default('active'),
  escalation_schedule: z
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

export const contractUpdateSchema = contractCreateSchema.extend({
  id: z.number().int().positive()
})

export const contractRenewSchema = z.object({
  contract_id: z.number().int().positive(),
  new_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  new_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rent_amount: z.number().positive(),
  security_deposit: z.number().nonnegative().default(0.0),
  has_variable_escalation: z.number().int().min(0).max(1),
  contract_term_years: z.number().int().min(1).max(20),
  annual_increase_percent: z.number().min(0).max(100).optional().nullable(),
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
