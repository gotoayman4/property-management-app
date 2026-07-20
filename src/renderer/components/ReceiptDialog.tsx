/**
 * INTENT: Printable receipt dialog for payment records (FR-INC-06).
 * CONSTRAINT: i18n keys only, theme.palette colors, explicit dir, media print rules.
 */
import PrintIcon from '@mui/icons-material/Print'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Typography,
  Paper
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface ReceiptPaymentData {
  id: number
  receipt_number: string | null
  payment_date: string
  amount: number
  currency: string
  payment_type: 'rent' | 'deposit' | 'other_income'
  payment_method: string | null
  notes?: string | null
  property_name: string
  tenant_fullname: string | null
  contract_number?: string | null
}

interface ReceiptDialogProps {
  open: boolean
  onClose: () => void
  payment: ReceiptPaymentData | null
}

interface CompanySettings {
  company_name: string | null
  company_logo: string | null
}

export function ReceiptDialog({
  open,
  onClose,
  payment
}: ReceiptDialogProps): React.ReactElement | null {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)

  useEffect(() => {
    if (open) {
      window.api.settings
        .get()
        .then((settings: unknown) => {
          const s = settings as CompanySettings
          setCompanySettings({
            company_name: s?.company_name ?? null,
            company_logo: s?.company_logo ?? null
          })
        })
        .catch((err: unknown) => {
          console.error('Failed to load settings for receipt:', err)
        })
    }
  }, [open])

  if (!payment) return null

  const handlePrint = (): void => {
    window.print()
  }

  const paymentTypeLabel =
    payment.payment_type === 'rent'
      ? t('payments.typeRent', 'Rent')
      : payment.payment_type === 'deposit'
        ? t('payments.typeDeposit', 'Deposit')
        : t('payments.typeOther', 'Other Income')

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth dir={isRtl ? 'rtl' : 'ltr'}>
      <DialogTitle
        sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h6">{t('receipt.title', 'Payment Receipt')}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        {/* Printable Area Wrapper */}
        <Paper
          elevation={0}
          className="printable-receipt"
          sx={{
            p: 3,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            position: 'relative'
          }}
        >
          {/* Header section with company logo and name */}
          <Box
            sx={{
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              mb: 3,
              pb: 2,
              borderBottom: '2px solid',
              borderColor: 'primary.main'
            }}
          >
            <Box>
              {companySettings?.company_logo ? (
                <Box
                  component="img"
                  src={companySettings.company_logo}
                  alt="Company Logo"
                  sx={{ maxHeight: 60, maxWidth: 180, objectFit: 'contain', mb: 1 }}
                />
              ) : null}
              <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                {companySettings?.company_name ||
                  t('receipt.defaultCompany', 'Property Management System')}
              </Typography>
            </Box>
            <Box sx={{ textAlign: isRtl ? 'left' : 'right' }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('receipt.receiptNumber', 'Receipt No')}
              </Typography>
              <Typography variant="h6" color="primary.main" sx={{ fontWeight: 'bold' }}>
                {payment.receipt_number || `#${payment.id}`}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {payment.payment_date}
              </Typography>
            </Box>
          </Box>

          {/* Payment Details Grid */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('payments.tenant', 'Tenant')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.tenant_fullname || t('common.none', 'N/A')}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('payments.property', 'Property')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.property_name}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('payments.type', 'Payment Type')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {paymentTypeLabel}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('payments.method', 'Payment Method')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.payment_method || t('common.none', 'N/A')}
              </Typography>
            </Grid>

            {payment.contract_number ? (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('contracts.contractNumber', 'Contract Number')}
                </Typography>
                <Typography variant="body2">{payment.contract_number}</Typography>
              </Grid>
            ) : null}

            {payment.notes ? (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('common.notes', 'Notes')}
                </Typography>
                <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                  {payment.notes}
                </Typography>
              </Grid>
            ) : null}
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Total Amount Box */}
          <Box
            sx={{
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              p: 2,
              borderRadius: 1.5,
              bgcolor: 'action.hover'
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              {t('receipt.totalPaid', 'Total Amount Paid')}
            </Typography>
            <Typography variant="h5" color="success.main" sx={{ fontWeight: 'bold' }}>
              {payment.amount.toLocaleString()} {payment.currency}
            </Typography>
          </Box>

          {/* Footer signature line */}
          <Box sx={{ mt: 5, pt: 3, display: 'flex', justifyContent: 'space-between' }}>
            <Box sx={{ width: 160, textAlign: 'center' }}>
              <Divider sx={{ mb: 1, borderColor: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {t('receipt.payerSignature', 'Payer Signature')}
              </Typography>
            </Box>
            <Box sx={{ width: 160, textAlign: 'center' }}>
              <Divider sx={{ mb: 1, borderColor: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {t('receipt.authorizedSignature', 'Authorized Receiver')}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          {t('common.close', 'Close')}
        </Button>
        <Button onClick={handlePrint} variant="contained" startIcon={<PrintIcon />}>
          {t('receipt.print', 'Print Receipt')}
        </Button>
      </DialogActions>

      {/* Global CSS for printing receipts */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .printable-receipt, .printable-receipt * {
            visibility: visible !important;
          }
          .printable-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </Dialog>
  )
}

export default ReceiptDialog
