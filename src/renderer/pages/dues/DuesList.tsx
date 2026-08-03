/**
 * @file DuesList — Outstanding rent dues (arrears) across all contracts.
 *
 * INTENT: The receivables view — every still-open past-due period, with per-currency arrears
 *         aging chips at the top and row actions to settle-before-app (bulk), waive (single),
 *         and record an opening balance. Complements the cash-side PaymentList.
 *
 * CONSTRAINT: All strings via t(); logical CSS only (RTL-safe); numbers grouped per currency.
 */
import {
  Add as AddIcon,
  Block as WaiveIcon,
  Delete as DeleteIcon,
  DoneAll as SettleIcon,
  Edit as EditIcon
} from '@mui/icons-material'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../../components/ConfirmDialog'
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
  due_type?: string
  period_key: string
  due_date: string
  amount_due: number
  amount_paid: number
  outstanding: number
  currency: string
  status: string
  /** Optional note (mirrors rent_dues.status_reason; surfaced for opening balances). */
  note?: string | null
  days_overdue: number
}

/** Only an opening balance that has never been collected may be edited or deleted. */
function isOpeningEditable(row: DueRow): boolean {
  return (
    row.due_type === 'opening_balance' && Number(row.amount_paid) === 0 && row.status === 'pending'
  )
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

  // Show only dues due TODAY or overdue (only_overdue => due_date <= today in the main process).
  // Future/upcoming periods are hidden — ordinary users only need what currently needs collecting.
  // A due added today (e.g. an opening balance dated today) still appears thanks to the <= semantics.
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
    editSeed?: { amount: number; as_of_date: string; note?: string | null }
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DueRow | null>(null)

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

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!deleteTarget) return
    try {
      await window.api.dues.deleteOpeningBalance({ due_id: deleteTarget.id })
      showSuccess('dues.deleteOpeningSuccess')
      setSelection({ type: 'include', ids: new Set() })
      reload()
    } catch (err) {
      console.error(err)
      const code = err instanceof Error ? err.message : ''
      showError(
        code === 'OPENING_BALANCE_NOT_DELETABLE' ? 'dues.cannotDeleteAllocated' : 'common.error'
      )
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, showSuccess, showError, reload])

  const columns: GridColDef[] = [
    { field: 'property_name', headerName: t('dues.col.property'), flex: 1.4 },
    { field: 'tenant_name', headerName: t('dues.col.tenant'), flex: 1.4 },
    {
      field: 'period_key',
      headerName: t('dues.col.period'),
      flex: 1,
      renderCell: (params) => (params.value === 'opening' ? t('dues.period.opening') : params.value)
    },
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
      field: 'note',
      headerName: t('dues.col.note'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as DueRow
        const text = row.note ?? ''
        if (!text) return '—'
        // Truncate with a hover tooltip so long notes don't blow out the row height.
        return (
          <Tooltip title={text} placement="top">
            <Box
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%'
              }}
            >
              {text}
            </Box>
          </Tooltip>
        )
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as DueRow
        const editable = isOpeningEditable(row)
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {editable && (
              <Tooltip title={t('dues.action.edit')}>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() =>
                    setDialog({
                      mode: 'edit',
                      dueId: row.id,
                      editSeed: {
                        amount: row.amount_due,
                        as_of_date: row.due_date,
                        note: row.note ?? null
                      }
                    })
                  }
                  aria-label={t('dues.action.edit')}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {editable && (
              <Tooltip title={t('dues.action.delete')}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDeleteTarget(row)}
                  aria-label={t('dues.action.delete')}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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
          </Box>
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
          editSeed={dialog.editSeed}
          onClose={() => setDialog(null)}
          onSuccess={onSuccess}
          onError={showError}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('dues.deleteOpeningTitle')}
        message={t('dues.deleteOpeningConfirm', {
          amount: deleteTarget?.amount_due.toLocaleString() ?? '',
          currency: deleteTarget?.currency ?? ''
        })}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        severity="error"
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
