/**
 * INTENT: Pending Due Instances tab (SRS §9.9.3) inside RecurringExpenseList. Lists all
 *         recurring expense instances whose next_due_date has arrived or passed, but which
 *         have NOT been actioned (confirmed/skipped) yet. Each row has:
 *           - "Record Expense" → confirms the instance (creates the expense, logs, advances)
 *           - "Skip" → user provides a reason, no expense created, cursor advances
 * CONSTRAINT (FR-REC-05/06): pre-filled expense form, BR-23 duplicate guard, i18n only.
 */
import {
  CheckCircleOutlined as CheckCircleOutlinedIcon,
  SkipNext as SkipIcon
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip
} from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'

interface PendingDueRow {
  template_id: number
  name: string
  property_id: number | null
  property_name: string | null
  due_date: string
  amount: number
  currency: string
  vendor_name: string | null
  frequency: string
}

interface PendingRecurringInstancesProps {
  /** Increment this to force a reload from the parent. */
  refreshKey: number
  /** Called after confirm or skip so the parent can refresh templates + pending list. */
  onChanged: () => void
}

export default function PendingRecurringInstances({
  refreshKey,
  onChanged
}: PendingRecurringInstancesProps): React.ReactElement {
  const { t, i18n } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [instances, setInstances] = useState<PendingDueRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Skip dialog state.
  const [skipTarget, setSkipTarget] = useState<PendingDueRow | null>(null)
  const [skipReason, setSkipReason] = useState<string>('')
  const [skipping, setSkipping] = useState<boolean>(false)

  const fetch = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const data = await window.api.recurringExpenses.pendingDue()
      setInstances(data as PendingDueRow[])
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetch()
  }, [fetch, refreshKey])

  const handleConfirm = async (row: PendingDueRow): Promise<void> => {
    try {
      await window.api.recurringExpenses.confirmInstance({
        template_id: row.template_id,
        due_date: row.due_date
      })
      showSuccess('recurringExpense.instanceConfirmed')
      onChanged()
    } catch {
      showError('common.saveError')
    }
  }

  const handleSkip = async (): Promise<void> => {
    if (!skipTarget || !skipReason.trim()) return
    try {
      setSkipping(true)
      await window.api.recurringExpenses.skipInstance({
        template_id: skipTarget.template_id,
        due_date: skipTarget.due_date,
        skip_reason: skipReason.trim()
      })
      showSuccess('recurringExpense.instanceSkipped')
      setSkipTarget(null)
      setSkipReason('')
      onChanged()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'INSTANCE_ALREADY_ACTIONED') showError('recurringExpense.instanceAlreadyActioned')
      else showError('common.saveError')
    } finally {
      setSkipping(false)
    }
  }

  const columns: GridColDef[] = [
    { field: 'name', headerName: t('recurringExpense.name'), flex: 1.5 },
    {
      field: 'property_name',
      headerName: t('common.property'),
      flex: 1.2,
      renderCell: (params) => (params.row as PendingDueRow).property_name ?? t('common.general')
    },
    { field: 'due_date', headerName: t('recurringExpense.nextDue'), width: 130 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as PendingDueRow
        return `${row.amount.toLocaleString(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en')} ${row.currency}`
      }
    },
    {
      field: 'days_overdue',
      headerName: t('recurringExpense.daysOverdue'),
      width: 100,
      renderCell: (params) => {
        const row = params.row as PendingDueRow
        const due = new Date(row.due_date + 'T00:00:00')
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const days = Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
        if (days <= 0) return '—'
        return <Chip size="small" color="error" variant="outlined" label={`${days}d`} />
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1.3,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as PendingDueRow
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('recurringExpense.recordExpense')}>
              <IconButton
                size="small"
                color="success"
                onClick={() => handleConfirm(row)}
                aria-label={t('recurringExpense.recordExpense')}
              >
                <CheckCircleOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('recurringExpense.skip')}>
              <IconButton
                size="small"
                onClick={() => {
                  setSkipTarget(row)
                  setSkipReason('')
                }}
                aria-label={t('recurringExpense.skip')}
              >
                <SkipIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )
      }
    }
  ]

  return (
    <>
      <StandardTable
        columns={columns}
        rows={instances}
        loading={loading}
        error={error ?? undefined}
        onRetry={fetch}
        emptyMessage={t('recurringExpense.noPendingInstances')}
      />

      {/* Skip-reason dialog (FR-REC-06: required reason before skipping) */}
      <Dialog
        open={skipTarget !== null}
        onClose={() => !skipping && setSkipTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('recurringExpense.skipTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label={t('recurringExpense.skipReason')}
            fullWidth
            multiline
            rows={2}
            margin="dense"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={skipping} onClick={() => setSkipTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={skipping || !skipReason.trim()}
            onClick={() => {
              void handleSkip()
            }}
            variant="contained"
          >
            {t('recurringExpense.skip')}
          </Button>
        </DialogActions>
      </Dialog>

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </>
  )
}
