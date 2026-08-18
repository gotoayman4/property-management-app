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
import { useDirection } from '../hooks/useDirection'

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
  const { t } = useTranslation()
  const isRtl = useDirection()
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
      ? t('payment.rent')
      : payment.payment_type === 'deposit'
        ? t('payment.deposit')
        : t('payment.otherIncome')

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth dir={isRtl ? 'rtl' : 'ltr'}>
      <DialogTitle
        sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h6" component="span">
          {t('receipt.title')}
        </Typography>
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
              justifyContent: 'space-between',
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
                  alt={companySettings?.company_name || t('receipt.defaultCompany')}
                  sx={{ maxHeight: 60, maxWidth: 180, objectFit: 'contain', mb: 1 }}
                />
              ) : null}
              <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                {companySettings?.company_name || t('receipt.defaultCompany')}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'end' }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('receipt.receiptNumber')}
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
                {t('common.tenant')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.tenant_fullname || t('common.none')}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('common.property')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.property_name}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('payment.paymentType')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {paymentTypeLabel}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('payment.paymentMethod')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.payment_method
                  ? t(
                      `payment.method${payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)}`
                    )
                  : t('common.none')}
              </Typography>
            </Grid>

            {payment.contract_number ? (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('contract.contractNumber')}
                </Typography>
                <Typography variant="body2">{payment.contract_number}</Typography>
              </Grid>
            ) : null}

            {payment.notes ? (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('common.notes')}
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
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              borderRadius: 1.5,
              bgcolor: 'action.hover'
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              {t('receipt.totalPaid')}
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
                {t('receipt.payerSignature')}
              </Typography>
            </Box>
            <Box sx={{ width: 160, textAlign: 'center' }}>
              <Divider sx={{ mb: 1, borderColor: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {t('receipt.authorizedSignature')}
              </Typography>
            </Box>
          </Box>

          {/* "PAID" stamp watermark */}
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: '45%',
              insetInlineStart: '28%',
              transform: 'rotate(-20deg)',
              border: '4px solid',
              borderColor: 'success.main',
              color: 'success.main',
              px: 3,
              py: 1,
              borderRadius: 1,
              opacity: 0.75,
              fontSize: 28,
              fontWeight: 'bold',
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            {t('receipt.paidStamp')}
          </Box>
        </Paper>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          {t('common.close')}
        </Button>
        <Button onClick={handlePrint} variant="contained" startIcon={<PrintIcon />}>
          {t('receipt.print')}
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
            inset-inline-start: 0 !important;
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
