/**
 * @file Shared types for the Reports page and its sub-components.
 *
 * INTENT: Single source of truth for report-related interfaces so the parent and child
 *         components stay in sync without circular imports.
 */
import type { GridColDef } from '@mui/x-data-grid'

export type ReportType =
  | 'income'
  | 'expense'
  | 'profit_loss'
  | 'property_profitability'
  | 'tenant_payment_history'
  | 'outstanding_balances'
  | 'vacancy'
  | 'contract_expiry'
  | 'recurring_schedule'
  | 'document_expiry'
  | 'dues_schedule'
  | 'ledger'

export const REPORT_TYPES: ReportType[] = [
  'income',
  'expense',
  'profit_loss',
  'property_profitability',
  'tenant_payment_history',
  'outstanding_balances',
  'vacancy',
  'contract_expiry',
  'recurring_schedule',
  'document_expiry',
  'dues_schedule',
  'ledger'
]

export interface ReportColumn {
  key: string
  headerKey: string
  type?: 'text' | 'number' | 'currency' | 'date'
  sumInTotals?: boolean
  isRunningBalance?: boolean
}

export interface ReportGroup {
  currency: string
  rows: Record<string, unknown>[]
  totals: Record<string, number>
}

export interface ReportData {
  titleKey: string
  columns: ReportColumn[]
  groups: ReportGroup[]
  consolidatedNote?: string
  /** Optional single group in the reporting currency (frozen base_amount per row). */
  consolidatedGroup?: ReportGroup
}

export interface Property {
  id: number
  name: string
  code: string
}

export interface Tenant {
  id: number
  fullname: string
}

/** Stable row IDs for DataGrid — some report rows have no `id` field (vacancy, P&L). */
export function makeRowId(prefix: string): (row: Record<string, unknown>) => string {
  return (row) =>
    String(
      row['id'] ??
        `${prefix}-${JSON.stringify(row).length}-${Math.random().toString(36).slice(2, 8)}`
    )
}

/**
 * Build DataGrid columns from the report's column metadata — header resolved via i18n.
 *
 * INTENT: Centralize column construction so both the main preview and any future sub-previews
 *         get the same formatting.
 */
export function buildGridColumns(
  data: ReportData,
  t: (key: string) => string,
  lang: string
): GridColDef[] {
  return data.columns.map((col) => {
    const base: GridColDef = {
      field: col.key,
      headerName: t(col.headerKey),
      flex: 1,
      minWidth: 110
    }
    if (col.type === 'number' || col.type === 'currency') {
      base.type = 'number'
      base.valueFormatter = (value: unknown) => {
        const n = Number(value ?? 0)
        return n.toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : 'en', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      }
    }
    return base
  })
}
