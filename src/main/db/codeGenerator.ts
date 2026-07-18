/**
 * Auto-generated code utilities for Properties and Tenants.
 *
 * INTENT: Generate short, human-readable, sequential codes based on entity attributes.
 *   - Property codes:  `{COUNTRY}-{TYPE}-{NNN}`  (e.g. TR-APT-001, US-SHP-002)
 *   - Tenant codes:    `{TYPE}-{NNN}`             (e.g. I-001, C-002)
 *
 * CONSTRAINT: Codes must match `/^[a-zA-Z0-9-]+$/`, min 2, max 20 chars.
 * DECISION: Sequential per group (country+type for property, type for tenant) keeps codes
 *           short and scannable. Pattern follows `generateReceiptNumber` in ledgerService.ts.
 * CAVEAT: The UNIQUE constraint in SQLite is the ultimate uniqueness guarantee, not this
 *         function. If a code collision somehow occurs (e.g. manual entry), the DB will reject it.
 */

import type { Database } from 'better-sqlite3'

type PropertyType = 'apartment' | 'shop'
type TenantType = 'individual' | 'company'

const PROPERTY_TYPE_MAP: Record<PropertyType, string> = {
  apartment: 'APT',
  shop: 'SHP'
}

const TENANT_TYPE_MAP: Record<TenantType, string> = {
  individual: 'I',
  company: 'C'
}

/**
 * Generate the next sequential property code for a given country + type combination.
 * Format: `{COUNTRY}-{TYPE}-{NNN}` — e.g. `TR-APT-001`, `US-SHP-003`.
 * Queries the highest existing code matching the prefix, increments the numeric tail, and
 * zero-pads to 3 digits. Returns `{COUNTRY}-{TYPE}-001` when no prior code exists.
 */
export function getNextPropertyCode(db: Database, country: string, type: PropertyType): string {
  const typeCode = PROPERTY_TYPE_MAP[type]
  const prefix = `${country.toUpperCase()}-${typeCode}-`
  const row = db
    .prepare(
      `SELECT code FROM properties
       WHERE code LIKE ? ESCAPE '\\'
       ORDER BY code DESC LIMIT 1`
    )
    .get(`${prefix}%`) as { code: string } | undefined

  let next = 1
  if (row?.code) {
    const tail = row.code.slice(prefix.length)
    const parsed = parseInt(tail, 10)
    if (!Number.isNaN(parsed)) {
      next = parsed + 1
    }
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}

/**
 * Generate the next sequential tenant code for a given type.
 * Format: `{TYPE}-{NNN}` — e.g. `I-001`, `C-003`.
 * Queries the highest existing code matching the prefix, increments the numeric tail, and
 * zero-pads to 3 digits. Returns `{TYPE}-001` when no prior code exists.
 */
export function getNextTenantCode(db: Database, type: TenantType): string {
  const typeCode = TENANT_TYPE_MAP[type]
  const prefix = `${typeCode}-`
  const row = db
    .prepare(
      `SELECT code FROM tenants
       WHERE code LIKE ? ESCAPE '\\'
       ORDER BY code DESC LIMIT 1`
    )
    .get(`${prefix}%`) as { code: string } | undefined

  let next = 1
  if (row?.code) {
    const tail = row.code.slice(prefix.length)
    const parsed = parseInt(tail, 10)
    if (!Number.isNaN(parsed)) {
      next = parsed + 1
    }
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}
