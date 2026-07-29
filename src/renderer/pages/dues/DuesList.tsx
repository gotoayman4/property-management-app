/**
 * @file DuesList — Outstanding rent dues (arrears) across all contracts.
 *
 * INTENT: The receivables view — every still-open past-due period, with per-currency arrears
 *         aging chips at the top and row actions to settle-before-app (bulk), waive (single),
 *         and record an opening balance. Complements the cash-side PaymentList.
 *
 * CONSTRAINT: All strings via t(); logical CSS only (RTL-safe); numbers grouped per currency.
 */
import { Add as AddIcon, Block as WaiveIcon, DoneAll as SettleIcon } from '@mui/icons-material'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import { useFetch } from '../../hooks/useFetch'
import { useSnackbar } from '../../hooks/useSnackbar'
import DueActionsDialog, { type DueActionMode } from './DueActionsDialog'

interface DueRow {
  id: number
  contract_id: number
  property_name?: string
  tenant_name?: string
  period_key: string
  due_date: string
  amount_due: number
  amount_paid: number
  outstanding: number
  currency: string
  status: string
  days_overdue: number
}

/** Aging-bucket chip colour by days past due. */
function agingColor(days: number): 'default' | 'warning' | 'error' {
  if (days > 60) return 'error'
  if (days > 30) return 'warning'
  return 'default'
}

export function DuesList(): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const fetchOutstanding = useCallback(
    () => window.api.dues.listOutstanding({ only_overdue: true }),
    []
  )
  const fetchSummary = useCallback(() => window.api.dues.summary(), [])

  const { data, loading, error, refetch } = useFetch(fetchOutstanding)
  const { data: summary, refetch: refetchSummary } = useFetch(fetchSummary)
  const dues = (data ?? []) as unknown as DueRow[]

  const [selection, setSelection] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set()
  })
  const [dialog, setDialog] = useState<{
    mode: DueActionMode
    dueIds?: number[]
    dueId?: number
  } | null>(null)

  const reload = useCallback((): void => {
    refetch()
    refetchSummary()
  }, [refetch, refetchSummary])

  const onSuccess = useCallback(
    (key: string): void => {
      showSuccess(key)
      setSelection({ type: 'include', ids: new Set() })
      reload()
    },
    [showSuccess, reload]
  )

  const columns: GridColDef[] = [
    { field: 'property_name', headerName: t('dues.col.property'), flex: 1.4 },
    { field: 'tenant_name', headerName: t('dues.col.tenant'), flex: 1.4 },
    { field: 'period_key', headerName: t('dues.col.period'), flex: 1 },
    { field: 'due_date', headerName: t('dues.col.dueDate'), flex: 1 },
    {
      field: 'amount_due',
      headerName: t('dues.col.amountDue'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as DueRow
        return `${row.amount_due.toLocaleString()} ${row.currency}`
      }
    },
    {
      field: 'outstanding',
      headerName: t('dues.col.outstanding'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as DueRow
        return `${row.outstanding.toLocaleString()} ${row.currency}`
      }
    },
    {
      field: 'days_overdue',
      headerName: t('dues.col.daysOverdue'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as DueRow
        if (row.days_overdue <= 0) return '—'
        return (
          <Chip
            label={t('dues.aging.days', { days: row.days_overdue })}
            color={agingColor(row.days_overdue)}
            size="small"
            variant="outlined"
          />
        )
      }
    },
    {
      field: 'status',
      headerName: t('dues.col.status'),
      flex: 0.9,
      renderCell: (params) => {
        const row = params.row as DueRow
        return t(`dues.status.${row.status}`)
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 0.8,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as DueRow
        return (
          <Tooltip title={t('dues.action.waive')}>
            <IconButton
              size="small"
              color="warning"
              onClick={() => setDialog({ mode: 'waive', dueId: row.id })}
              aria-label={t('dues.action.waive')}
            >
              <WaiveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )
      }
    }
  ]

  const selectedIds = Array.from(selection.ids).map(Number)

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<RequestQuoteIcon />}
        title={t('dues.title')}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<SettleIcon />}
              disabled={selectedIds.length === 0}
              onClick={() => setDialog({ mode: 'settle', dueIds: selectedIds })}
            >
              {t('dues.action.settle')}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialog({ mode: 'opening' })}
            >
              {t('dues.action.openingBalance')}
            </Button>
          </Stack>
        }
      />

      {summary && (summary as unknown[]).length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          {(summary as unknown as Array<{ currency: string; total_outstanding: number }>).map(
            (s) => (
              <Chip
                key={s.currency}
                color="error"
                variant="outlined"
                label={
                  <Typography variant="body2" component="span">
                    {t('dues.totalOutstanding', {
                      amount: s.total_outstanding.toLocaleString(),
                      currency: s.currency
                    })}
                  </Typography>
                }
              />
            )
          )}
        </Stack>
      )}

      <StandardTable
        columns={columns}
        rows={dues}
        loading={loading}
        error={error ?? undefined}
        onRetry={reload}
        emptyMessage={t('dues.noDues')}
        tableId="dues-list"
        checkboxSelection
        onRowSelectionModelChange={setSelection}
        rowSelectionModel={selection}
      />

      {dialog && (
        <DueActionsDialog
          open
          mode={dialog.mode}
          dueIds={dialog.dueIds}
          dueId={dialog.dueId}
          onClose={() => setDialog(null)}
          onSuccess={onSuccess}
          onError={showError}
        />
      )}

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
