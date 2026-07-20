import {
  CancelOutlined as CancelOutlinedIcon,
  Payments as PaymentsIcon,
  Add as AddIcon,
  ReceiptLong as ReceiptLongIcon
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  Tooltip
} from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import ReceiptDialog from '../../components/ReceiptDialog'
import StandardDialog from '../../components/StandardDialog'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'
import { PaymentForm } from './PaymentForm'

/**
 * INTENT: List payments (income) with a void action. Recording happens in the PaymentForm dialog;
 *         voiding opens a reason prompt because BR-20 requires a reason for every void.
 * CONSTRAINT: All four list states (loading/error/empty/success) are handled by StandardTable.
 *             Void never deletes — it appends a reversal ledger row (BR-20), so voided rows stay
 *             visible with a badge.
 */

interface Payment {
  id: number
  receipt_number: string | null
  payment_date: string
  amount: number
  currency: string
  payment_type: 'rent' | 'deposit' | 'other_income'
  payment_method: string | null
  is_partial: number
  is_voided: number
  void_reason: string | null
  property_name: string
  property_code: string
  tenant_fullname: string | null
  contract_number: string | null
}

export function PaymentList(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null)
  const [voidReason, setVoidReason] = useState<string>('')
  const [receiptTarget, setReceiptTarget] = useState<Payment | null>(null)

  const fetchPayments = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const data = (await window.api.payments.list()) as Payment[]
      setPayments(data)
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPayments()
  }, [fetchPayments])

  const handleVoidClick = (payment: Payment): void => {
    setVoidTarget(payment)
    setVoidReason('')
  }

  const confirmVoid = async (): Promise<void> => {
    if (!voidTarget) return
    const reason = voidReason.trim()
    if (!reason) return // the field-level error guides the user; button stays enabled per pattern
    const target = voidTarget
    setVoidTarget(null)
    try {
      await window.api.payments.void({ id: target.id, reason })
      showSuccess('common.saveSuccess')
      fetchPayments()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'VOID_REASON_REQUIRED') showError('payment.voidReasonRequired')
      else showError('common.deleteError')
    }
  }

  const columns: GridColDef[] = [
    {
      field: 'receipt_number',
      headerName: t('payment.receiptNumber'),
      flex: 1.2
    },
    {
      field: 'payment_date',
      headerName: t('payment.paymentDate'),
      flex: 1.1
    },
    {
      field: 'property_name',
      headerName: t('common.property'),
      flex: 1.5,
      renderCell: (params) => {
        const row = params.row as Payment
        return `${row.property_name} (${row.property_code})`
      }
    },
    {
      field: 'tenant_fullname',
      headerName: t('common.tenant'),
      flex: 1.3,
      renderCell: (params) => (params.row as Payment).tenant_fullname || '—'
    },
    {
      field: 'payment_type',
      headerName: t('payment.paymentType'),
      flex: 1.1,
      renderCell: (params) => t(`payment.${(params.row as Payment).payment_type}`)
    },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as Payment
        return `${row.amount.toLocaleString()} ${row.currency}`
      }
    },
    {
      field: 'status',
      headerName: t('common.status'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as Payment
        return row.is_voided ? (
          <Chip label={t('payment.voidedBadge')} color="error" size="small" variant="outlined" />
        ) : row.is_partial ? (
          <Chip label={t('payment.isPartial')} color="warning" size="small" variant="outlined" />
        ) : (
          <Chip label={t('common.success')} color="success" size="small" variant="outlined" />
        )
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as Payment
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('receipt.print', 'Print Receipt')}>
              <IconButton
                size="small"
                color="primary"
                onClick={() => setReceiptTarget(row)}
                aria-label={t('receipt.print', 'Print Receipt')}
              >
                <ReceiptLongIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {!row.is_voided && (
              <Tooltip title={t('payment.void')}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleVoidClick(row)}
                  aria-label={t('payment.void')}
                >
                  <CancelOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<PaymentsIcon />}
        title={t('payment.title')}
        action={
          <Button
            variant="contained"
            startIcon={isRtl ? undefined : <AddIcon />}
            endIcon={isRtl ? <AddIcon /> : undefined}
            onClick={() => setOpenDialog(true)}
            sx={{ px: 3, py: 1, borderRadius: 2 }}
          >
            {t('payment.add')}
          </Button>
        }
      />

      <StandardTable
        columns={columns}
        rows={payments}
        loading={loading}
        error={error ?? undefined}
        onRetry={fetchPayments}
        emptyMessage={t('payment.noPayments')}
        tableId="payment-list"
      />

      <StandardDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title={t('payment.add')}
        maxWidth="md"
      >
        <PaymentForm
          onSuccess={() => {
            setOpenDialog(false)
            fetchPayments()
          }}
          onCancel={() => setOpenDialog(false)}
        />
      </StandardDialog>

      {/* Void reason prompt — separate from StandardDialog to collect the required reason (BR-20). */}
      <Dialog
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('payment.void')}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TypographyMuted text={t('payment.voidConfirm')} />
            <TextField
              autoFocus
              fullWidth
              label={t('payment.voidReasonLabel')}
              placeholder={t('payment.voidReasonPlaceholder')}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              error={voidReason.trim().length === 0 && voidReason.length > 0}
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
            {t('payment.void')}
          </Button>
        </DialogActions>
      </Dialog>

      <ReceiptDialog
        open={receiptTarget !== null}
        onClose={() => setReceiptTarget(null)}
        payment={receiptTarget}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}

/** Small helper to keep the void-confirm body copy styled as muted secondary text. */
function TypographyMuted({ text }: { text: string }): React.ReactElement {
  return (
    <Box component="span" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.875rem' }}>
      {text}
    </Box>
  )
}
