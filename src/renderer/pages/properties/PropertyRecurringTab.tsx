/**
 * INTENT: Property recurring expenses tab — shows recurring expense templates filtered by property.
 *         Read-only display with status chip and next due date.
 * CONSTRAINT: i18n keys only, StandardTable, logical CSS.
 */
import { Box, Chip } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StandardTable from '../../components/StandardTable'

interface RecurringTemplate {
  id: number
  name: string
  amount: number
  currency: string
  frequency: string
  next_due_date: string | null
  is_active: number
  category_name_key?: string
}

const FREQUENCY_KEYS: Record<string, string> = {
  daily: 'recurringExpense.frequencyDaily',
  weekly: 'recurringExpense.frequencyWeekly',
  monthly: 'contract.monthly',
  quarterly: 'contract.quarterly',
  semi_annual: 'contract.semiAnnual',
  annual: 'contract.annual'
}

interface PropertyRecurringTabProps {
  propertyId: number
  currency: string
}

export default function PropertyRecurringTab({
  propertyId
}: PropertyRecurringTabProps): React.ReactElement {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const data = (await window.api.recurringExpenses.list({
          property_id: propertyId
        })) as RecurringTemplate[]
        if (!cancelled) setTemplates(data)
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
    { field: 'name', headerName: t('common.name'), flex: 1.5 },
    {
      field: 'category_name_key',
      headerName: t('expense.category'),
      flex: 1,
      renderCell: (params) => {
        const key = (params.row as RecurringTemplate).category_name_key
        return key ? t(key) : '—'
      }
    },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as RecurringTemplate
        return `${row.amount.toLocaleString()} ${row.currency}`
      }
    },
    {
      field: 'frequency',
      headerName: t('recurringExpense.frequency'),
      flex: 1,
      renderCell: (params) => {
        const freq = (params.row as RecurringTemplate).frequency
        return t(FREQUENCY_KEYS[freq] ?? freq)
      }
    },
    {
      field: 'next_due_date',
      headerName: t('recurringExpense.nextDue'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as RecurringTemplate
        return row.next_due_date ?? '—'
      }
    },
    {
      field: 'is_active',
      headerName: t('common.status'),
      flex: 0.8,
      renderCell: (params) => {
        const row = params.row as RecurringTemplate
        return row.is_active ? (
          <Chip label={t('common.active')} color="success" size="small" variant="outlined" />
        ) : (
          <Chip label={t('common.paused')} color="warning" size="small" variant="outlined" />
        )
      }
    }
  ]

  return (
    <Box>
      <StandardTable
        columns={columns}
        rows={templates}
        loading={loading}
        emptyMessage={t('propertyDetail.noRecurringExpenses')}
      />
    </Box>
  )
}
