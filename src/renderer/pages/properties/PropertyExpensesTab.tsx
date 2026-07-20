/**
 * INTENT: Property-specific expenses tab — shows expenses filtered by property_id.
 *         Reuses expense list columns pattern but scoped to this property.
 * CONSTRAINT: i18n keys only, StandardTable, logical CSS.
 */
import { Box, Chip } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StandardTable from '../../components/StandardTable'

interface Expense {
  id: number
  expense_date: string
  amount: number
  currency: string
  vendor_name: string | null
  is_voided: number
  category_name_key: string
  notes: string | null
}

interface PropertyExpensesTabProps {
  propertyId: number
  currency: string
}

export default function PropertyExpensesTab({
  propertyId
}: PropertyExpensesTabProps): React.ReactElement {
  const { t } = useTranslation()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const data = (await window.api.expenses.list({ property_id: propertyId })) as Expense[]
        if (!cancelled) setExpenses(data)
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [propertyId])

  const columns: GridColDef[] = [
    { field: 'expense_date', headerName: t('common.date'), flex: 1 },
    {
      field: 'category_name_key',
      headerName: t('expense.category'),
      flex: 1.2,
      renderCell: (params) => {
        const key = (params.row as Expense).category_name_key
        return key ? t(key) : '—'
      }
    },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as Expense
        return `${row.amount.toLocaleString()} ${row.currency}`
      }
    },
    {
      field: 'vendor_name',
      headerName: t('expense.vendor'),
      flex: 1.2,
      renderCell: (params) => (params.row as Expense).vendor_name ?? '—'
    },
    {
      field: 'is_voided',
      headerName: t('common.status'),
      flex: 0.8,
      renderCell: (params) => {
        const row = params.row as Expense
        return row.is_voided ? (
          <Chip label={t('common.voided')} color="error" size="small" variant="outlined" />
        ) : (
          <Chip label={t('common.active')} color="success" size="small" variant="outlined" />
        )
      }
    }
  ]

  return (
    <Box>
      <StandardTable
        columns={columns}
        rows={expenses}
        loading={loading}
        emptyMessage={t('propertyDetail.noExpenses')}
        tableId="property-expenses"
      />
    </Box>
  )
}
