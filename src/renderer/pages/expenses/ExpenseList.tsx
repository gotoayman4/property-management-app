import React, { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material'
import { ReceiptLong as ReceiptIcon, Add as AddIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { GridColDef } from '@mui/x-data-grid'
import StandardTable from '../../components/StandardTable'
import StandardDialog from '../../components/StandardDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import { useSnackbar } from '../../hooks/useSnackbar'
import { ExpenseForm } from './ExpenseForm'

/**
 * INTENT: List expenses with a void action. Mirrors PaymentList — voiding requires a reason (BR-20)
 *         and never deletes the row; voided rows remain visible with a badge.
 * CONSTRAINT: General (property-less) expenses display the "general" label and never tie to a
 *             property balance (BR-11).
 */

interface Expense {
  id: number
  expense_date: string
  amount: number
  currency: string
  vendor_name: string | null
  is_voided: number
  void_reason: string | null
  property_name: string | null
  property_code: string | null
  category_name_key: string
}

export function ExpenseList(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null)
  const [voidReason, setVoidReason] = useState<string>('')

  const fetchExpenses = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const data = (await window.api.expenses.list()) as Expense[]
      setExpenses(data)
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchExpenses()
  }, [fetchExpenses])

  const handleVoidClick = (expense: Expense): void => {
    setVoidTarget(expense)
    setVoidReason('')
  }

  const confirmVoid = async (): Promise<void> => {
    if (!voidTarget) return
    const reason = voidReason.trim()
    if (!reason) return
    const target = voidTarget
    setVoidTarget(null)
    try {
      await window.api.expenses.void({ id: target.id, reason })
      showSuccess('common.saveSuccess')
      fetchExpenses()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'VOID_REASON_REQUIRED') showError('payment.voidReasonRequired')
      else showError('common.deleteError')
    }
  }

  const columns: GridColDef[] = [
    {
      field: 'expense_date',
      headerName: t('expense.expenseDate'),
      flex: 1.1
    },
    {
      field: 'property_name',
      headerName: t('common.property'),
      flex: 1.4,
      renderCell: (params) => {
        const row = params.row as Expense
        return row.property_name
          ? `${row.property_name} (${row.property_code})`
          : t('common.general')
      }
    },
    {
      field: 'category_name_key',
      headerName: t('common.category'),
      flex: 1.2,
      renderCell: (params) => t((params.row as Expense).category_name_key)
    },
    {
      field: 'vendor_name',
      headerName: t('expense.vendor'),
      flex: 1.3,
      renderCell: (params) => (params.row as Expense).vendor_name || '—'
    },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as Expense
        return `${row.amount.toLocaleString()} ${row.currency}`
      }
    },
    {
      field: 'status',
      headerName: t('common.status'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as Expense
        return row.is_voided ? (
          <Chip label={t('expense.voidedBadge')} color="error" size="small" variant="outlined" />
        ) : (
          <Chip label={t('common.success')} color="success" size="small" variant="outlined" />
        )
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1.2,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as Expense
        return row.is_voided ? null : (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => handleVoidClick(row)}
          >
            {t('expense.void')}
          </Button>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<ReceiptIcon />}
        title={t('expense.title')}
        action={
          <Button
            variant="contained"
            startIcon={isRtl ? undefined : <AddIcon />}
            endIcon={isRtl ? <AddIcon /> : undefined}
            onClick={() => setOpenDialog(true)}
            sx={{ px: 3, py: 1, borderRadius: 2 }}
          >
            {t('expense.add')}
          </Button>
        }
      />

      <StandardTable
        columns={columns}
        rows={expenses}
        loading={loading}
        error={error ?? undefined}
        onRetry={fetchExpenses}
        emptyMessage={t('expense.noExpenses')}
      />

      <StandardDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title={t('expense.add')}
        maxWidth="md"
      >
        <ExpenseForm
          onSuccess={() => {
            setOpenDialog(false)
            fetchExpenses()
          }}
          onCancel={() => setOpenDialog(false)}
        />
      </StandardDialog>

      <Dialog
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('expense.void')}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Box
              component="span"
              sx={{ color: 'text.secondary', display: 'block', fontSize: '0.875rem' }}
            >
              {t('expense.voidConfirm')}
            </Box>
            <TextField
              autoFocus
              fullWidth
              label={t('payment.voidReasonLabel')}
              placeholder={t('payment.voidReasonPlaceholder')}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              helperText={voidReason.trim().length === 0 ? t('payment.voidReasonRequired') : ''}
              sx={{ mt: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button variant="outlined" onClick={() => setVoidTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmVoid}
            disabled={voidReason.trim().length === 0}
          >
            {t('expense.void')}
          </Button>
        </DialogActions>
      </Dialog>

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
