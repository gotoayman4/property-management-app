/**
 * INTENT: Global search across all entities — properties, tenants, contracts, payments, expenses.
 *         Returns grouped results with entity type, ID, title, and snippet.
 * CONSTRAINT: SQL parameterized queries only. Search is case-insensitive LIKE.
 */
import { ipcMain } from 'electron'
import { db } from '../db/database'

interface SearchResult {
  entity_type: string
  entity_id: number
  title: string
  subtitle: string
}

export function registerSearchIpcHandlers(): void {
  ipcMain.handle('search:global', async (_, query: string) => {
    try {
      if (!query || query.trim().length < 2) return []

      const pattern = `%${query.trim()}%`
      const results: SearchResult[] = []

      // Properties
      const properties = db
        .prepare(
          `SELECT id, code, name, type, status FROM properties
           WHERE is_archived = 0 AND (name LIKE ? OR code LIKE ? OR address LIKE ?)
           ORDER BY name LIMIT 5`
        )
        .all(pattern, pattern, pattern) as Array<{
        id: number
        code: string
        name: string
        type: string
        status: string
      }>

      for (const p of properties) {
        results.push({
          entity_type: 'property',
          entity_id: p.id,
          title: `${p.name} (${p.code})`,
          subtitle: `${p.type} — ${p.status}`
        })
      }

      // Tenants
      const tenants = db
        .prepare(
          `SELECT id, code, fullname, country_code, phone FROM tenants
           WHERE is_active = 1 AND (fullname LIKE ? OR code LIKE ? OR phone LIKE ? OR country_code LIKE ?)
           ORDER BY fullname LIMIT 5`
        )
        .all(pattern, pattern, pattern, pattern) as Array<{
        id: number
        code: string
        fullname: string
        country_code: string | null
        phone: string
      }>

      for (const t of tenants) {
        const displayPhone = t.country_code ? `+${t.country_code} ${t.phone}` : t.phone
        results.push({
          entity_type: 'tenant',
          entity_id: t.id,
          title: `${t.fullname} (${t.code})`,
          subtitle: displayPhone
        })
      }

      // Contracts
      const contracts = db
        .prepare(
          `SELECT c.id, c.contract_number, c.status, p.name as property_name, t.fullname as tenant_name
           FROM contracts c
           LEFT JOIN properties p ON c.property_id = p.id
           LEFT JOIN tenants t ON c.tenant_id = t.id
           WHERE c.contract_number LIKE ? OR p.name LIKE ? OR t.fullname LIKE ?
           ORDER BY c.created_at DESC LIMIT 5`
        )
        .all(pattern, pattern, pattern) as Array<{
        id: number
        contract_number: string
        status: string
        property_name: string
        tenant_name: string
      }>

      for (const c of contracts) {
        results.push({
          entity_type: 'contract',
          entity_id: c.id,
          title: `Contract ${c.contract_number}`,
          subtitle: `${c.property_name} → ${c.tenant_name} (${c.status})`
        })
      }

      // Payments
      const payments = db
        .prepare(
          `SELECT p.id, p.receipt_number, p.amount, p.currency, p.payment_type, p.payment_date,
                  pr.name as property_name
           FROM payments p
           LEFT JOIN properties pr ON p.property_id = pr.id
           WHERE p.is_voided = 0 AND (p.receipt_number LIKE ? OR pr.name LIKE ?)
           ORDER BY p.payment_date DESC LIMIT 5`
        )
        .all(pattern, pattern) as Array<{
        id: number
        receipt_number: string
        amount: number
        currency: string
        payment_type: string
        payment_date: string
        property_name: string
      }>

      for (const p of payments) {
        results.push({
          entity_type: 'payment',
          entity_id: p.id,
          title: `Payment ${p.receipt_number}`,
          subtitle: `${p.amount} ${p.currency} — ${p.property_name} (${p.payment_date})`
        })
      }

      return results
    } catch {
      throw new Error('FAILED_TO_SEARCH')
    }
  })
}
