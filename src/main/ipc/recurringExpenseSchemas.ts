/**
 * @file Zod schemas for recurring-expense IPC validation.
 *
 * INTENT: Centralize all input validation schemas so the IPC handler file stays focused on
 *         handler registration and orchestration.
 * CONSTRAINT: Every schema must match the shape sent by the renderer preload bridge.
 */
import { z } from 'zod'

export const FREQUENCY_ENUM = z.enum([
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'semi-annual',
  'annual'
])

export const templateCreateSchema = z.object({
  property_id: z.number().int().positive().nullable().optional(),
  category_id: z.number().int().positive(),
  name: z.string().min(2).max(150),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  frequency: FREQUENCY_ENUM,
  day_of_month: z.number().int().min(1).max(31).default(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  vendor_name: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable()
})

export const templateUpdateSchema = templateCreateSchema.extend({
  id: z.number().int().positive()
})

export const templateListFiltersSchema = z
  .object({
    property_id: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
    frequency: FREQUENCY_ENUM.optional()
  })
  .optional()
  .nullable()

export const idSchema = z.number().int().positive()

export const skipSchema = z.object({
  template_id: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  skip_reason: z.string().min(1).max(500)
})

export const confirmSchema = z.object({
  template_id: z.number().int().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive().optional(),
  notes: z.string().max(500).optional().nullable()
})
