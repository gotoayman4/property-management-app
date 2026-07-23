/**
 * INTENT: Global search across all entities — properties, tenants, contracts, payments, expenses.
 *         Returns grouped results with entity type, ID, title, and snippet.
 * CONSTRAINT: SQL parameterized queries only. Search is case-insensitive LIKE.
 */
import { ipcMain } from 'electron'
import { db } from '../db/database'
import { resolveLocaleKey, tryResolveLocaleKey } from '../services/exportService/exportUtils'
import type { ExportLanguage } from '../services/exportService/exportUtils'

interface SearchResult {
  entity_type: string
  entity_id: number
  title: string
  subtitle: string
  parent_type?: string | null
  parent_id?: number | null
}

export function registerSearchIpcHandlers(): void {
  ipcMain.handle('search:global', async (_, query: string) => {
    try {
      if (!query || query.trim().length < 2) return []

      let lang: ExportLanguage = 'ar'
      try {
        const row = db.prepare('SELECT app_language FROM settings WHERE id = 1').get() as
          { app_language?: string } | undefined
        if (row?.app_language === 'en') lang = 'en'
      } catch {
        // Default to Arabic on missing settings
      }

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

      const propertyTypeMap: Record<string, string> = {
        apartment: resolveLocaleKey('property.apartment', lang),
        shop: resolveLocaleKey('property.shop', lang)
      }
      const propertyStatusMap: Record<string, string> = {
        vacant: resolveLocaleKey('property.statusVacant', lang),
        rented: resolveLocaleKey('property.statusRented', lang),
        maintenance: resolveLocaleKey('property.statusMaintenance', lang)
      }
      for (const p of properties) {
        results.push({
          entity_type: 'property',
          entity_id: p.id,
          title: `${p.name} (${p.code})`,
          subtitle: `${propertyTypeMap[p.type] ?? p.type} — ${propertyStatusMap[p.status] ?? p.status}`
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

      const contractStatusMap: Record<string, string> = {
        draft: resolveLocaleKey('contract.draft', lang),
        active: resolveLocaleKey('contract.active', lang),
        expired: resolveLocaleKey('contract.expired', lang),
        terminated: resolveLocaleKey('contract.terminated', lang),
        cancelled: resolveLocaleKey('contract.cancelled', lang),
        renewing: resolveLocaleKey('contract.renewing', lang)
      }
      for (const c of contracts) {
        results.push({
          entity_type: 'contract',
          entity_id: c.id,
          title: `${resolveLocaleKey('search.contract', lang)} ${c.contract_number}`,
          subtitle: `${c.property_name} → ${c.tenant_name} (${contractStatusMap[c.status] ?? c.status})`
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
          title: `${resolveLocaleKey('search.payment', lang)} ${p.receipt_number}`,
          subtitle: `${p.amount} ${p.currency} — ${p.property_name} (${p.payment_date})`
        })
      }

      // Expenses (FR-SRCH-00 addition)
      const expenses = db
        .prepare(
          `SELECT e.id, e.amount, e.currency, e.expense_date, e.vendor_name,
                  ec.name_key as category_key, pr.name as property_name
           FROM expenses e
           LEFT JOIN expense_categories ec ON e.category_id = ec.id
           LEFT JOIN properties pr ON e.property_id = pr.id
           WHERE e.is_voided = 0
             AND (e.vendor_name LIKE ? OR e.notes LIKE ? OR ec.name_key LIKE ? OR pr.name LIKE ?)
           ORDER BY e.expense_date DESC LIMIT 5`
        )
        .all(pattern, pattern, pattern, pattern) as Array<{
        id: number
        amount: number
        currency: string
        expense_date: string
        vendor_name: string | null
        category_key: string
        property_name: string | null
      }>

      for (const e of expenses) {
        const categoryLabel = tryResolveLocaleKey(e.category_key, lang)
        const propName = e.property_name ?? resolveLocaleKey('search.generalExpense', lang)
        results.push({
          entity_type: 'expense',
          entity_id: e.id,
          title: `${resolveLocaleKey('search.expense', lang)}: ${categoryLabel}`,
          subtitle: `${e.amount} ${e.currency} — ${propName} (${e.expense_date})`
        })
      }

      // Documents (FR-SRCH-00 addition)
      const documents = db
        .prepare(
          `SELECT d.id, d.file_name, d.document_type, d.entity_type, d.entity_id
           FROM documents d
           WHERE d.is_archived = 0
             AND (d.file_name LIKE ? OR d.description LIKE ? OR d.document_type LIKE ?)
           ORDER BY d.uploaded_at DESC LIMIT 5`
        )
        .all(pattern, pattern, pattern) as Array<{
        id: number
        file_name: string
        document_type: string | null
        entity_type: string
        entity_id: number
      }>

      for (const d of documents) {
        const docTypeLabel = d.document_type
          ? tryResolveLocaleKey(`documents.types.${d.document_type}`, lang)
          : resolveLocaleKey('search.other', lang)
        results.push({
          entity_type: 'document',
          entity_id: d.id,
          title: d.file_name,
          subtitle: `${resolveLocaleKey('search.doc', lang)}: ${docTypeLabel} (${d.entity_type})`,
          parent_type: d.entity_type,
          parent_id: d.entity_id
        })
      }

      return results
    } catch {
      throw new Error('FAILED_TO_SEARCH')
    }
  })
}
