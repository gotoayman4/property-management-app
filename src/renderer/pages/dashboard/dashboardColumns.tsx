/**
 * @file dashboardColumns — Column definitions for all StandardTables on the Dashboard.
 *
 * INTENT: Keep Dashboard.tsx under the 500-line limit by extracting the 8 column
 *         definition arrays. Each factory takes the i18n `t` function so translations
 *         remain reactive to language changes.
 *
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens.
 * DECISION: Pure functions returning GridColDef[] — no React state or side effects.
 */
import { Chip } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import type { TFunction } from 'i18next'
import { ActivityDescription } from '../../components/dashboardCharts'
import type {
  UpcomingDueRow,
  OverdueRow,
  UpcomingRecurringRow,
  ExpiringDocumentRow
} from './dashboardTypes'

export function upcomingDueCols(t: TFunction): GridColDef[] {
  return [
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 110 },
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1, minWidth: 100 },
    {
      field: 'rent_amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 90,
      type: 'number',
      valueFormatter: (value: number, row: UpcomingDueRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    },
    { field: 'end_date', headerName: t('contract.endDate'), flex: 1, minWidth: 100 }
  ]
}

export function overdueCols(t: TFunction): GridColDef[] {
  return [
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1, minWidth: 100 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 110 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 90,
      type: 'number',
      valueFormatter: (value: number, row: OverdueRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    },
    {
      field: 'payment_date',
      headerName: t('common.date'),
      flex: 1,
      minWidth: 100,
      renderCell: (params: { row: OverdueRow }) => (
        <Chip size="small" label={params.row.payment_date} color="error" variant="outlined" />
      )
    }
  ]
}

export function recurringCols(t: TFunction): GridColDef[] {
  return [
    { field: 'name', headerName: t('expense.name'), flex: 1, minWidth: 110 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 100 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 90,
      type: 'number',
      valueFormatter: (value: number, row: UpcomingRecurringRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    },
    { field: 'next_due_date', headerName: t('common.date'), flex: 1, minWidth: 100 }
  ]
}

export function docCols(t: TFunction): GridColDef[] {
  return [
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 110 },
    {
      field: 'document_type',
      headerName: t('documents.documentType'),
      flex: 1,
      minWidth: 100,
      valueFormatter: (value: string | null) => {
        if (!value) return '—'
        try {
          return t(`documents.types.${value}`, value)
        } catch {
          return value
        }
      }
    },
    { field: 'file_name', headerName: t('documents.fileName'), flex: 1, minWidth: 110 },
    {
      field: 'expiry_date',
      headerName: t('documents.expiryDate'),
      flex: 1,
      minWidth: 100,
      renderCell: (params: { row: ExpiringDocumentRow }) => (
        <Chip size="small" label={params.row.expiry_date} color="warning" variant="outlined" />
      )
    }
  ]
}

export function recentPaymentCols(t: TFunction): GridColDef[] {
  return [
    { field: 'payment_date', headerName: t('common.date'), flex: 1, minWidth: 100 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 120 },
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1, minWidth: 120 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 100,
      type: 'number'
    }
  ]
}

export function recentExpenseCols(t: TFunction): GridColDef[] {
  return [
    { field: 'expense_date', headerName: t('common.date'), flex: 1, minWidth: 100 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 120 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 100,
      type: 'number'
    }
  ]
}

export function recentActivityCols(t: TFunction): GridColDef[] {
  return [
    { field: 'activity_date', headerName: t('common.date'), flex: 1, minWidth: 100 },
    {
      field: 'entity_type',
      headerName: t('common.type'),
      flex: 1,
      minWidth: 100,
      renderCell: (params) => {
        const val = String(params.value ?? '')
        return (
          <Chip
            size="small"
            label={t(`dashboard.activity.${val}`)}
            color={
              val === 'payment'
                ? 'success'
                : val === 'expense'
                  ? 'error'
                  : val === 'contract'
                    ? 'info'
                    : 'default'
            }
            variant="outlined"
          />
        )
      }
    },
    {
      field: 'description',
      headerName: t('common.description'),
      flex: 2,
      minWidth: 180,
      renderCell: (params) => <ActivityDescription row={params.row} t={t} />
    }
  ]
}
