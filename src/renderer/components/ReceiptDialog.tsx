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
  property_code: string | null
  tenant_fullname: string | null
  tenant_phone: string | null
  tenant_email: string | null
  tenant_preferred_language: string | null
  contract_number?: string | null
  contract_id?: number | null
  is_voided: number
  void_reason: string | null
  related_period_month?: string | null
}

export interface ReceiptContext {
  /** Dues billed up to (and incl.) this payment's date minus payments through that date. */
  outstanding: number
  currency: string
  last_payment: {
    date: string
    amount: number
    receipt_number: string
  } | null
}

interface ReceiptDialogProps {
  open: boolean
  onClose: () => void
  payment: ReceiptPaymentData | null
}

interface CompanySettings {
  company_name: string | null
  company_logo: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
}

/** Format a YYYY-MM string into a readable month name using the given translation function. */
function formatPeriodMonth(yyyymm: string, t: (key: string) => string): string {
  const [year, month] = yyyymm.split('-')
  const monthNum = parseInt(month, 10)
  const monthName = t(`reports.months.${monthNum}`)
  return `${monthName} ${year}`
}

export function ReceiptDialog({
  open,
  onClose,
  payment
}: ReceiptDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const isRtl = useDirection()
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [receiptContext, setReceiptContext] = useState<ReceiptContext | null>(null)
  const [receiptDate, setReceiptDate] = useState<string>('')

  // Determine receipt language: Arabic if tenant's preferred_language is 'ar', else English
  const receiptLang = payment?.tenant_preferred_language === 'ar' ? 'ar' : 'en'

  useEffect(() => {
    if (open) {
      window.api.settings
        .get()
        .then((settings: unknown) => {
          const s = settings as CompanySettings
          setCompanySettings({
            company_name: s?.company_name ?? null,
            company_logo: s?.company_logo ?? null,
            company_address: s?.company_address ?? null,
            company_phone: s?.company_phone ?? null,
            company_email: s?.company_email ?? null
          })
        })
        .catch((err: unknown) => {
          console.error('Failed to load settings for receipt:', err)
        })

      // Fetch receipt context (remaining due + last previous payment)
      if (payment) {
        window.api.payments
          .getReceiptContext(payment.id)
          .then((ctx: ReceiptContext) => {
            setReceiptContext(ctx)
          })
          .catch((err: unknown) => {
            console.error('Failed to load receipt context:', err)
          })
      }

      // Receipt date = today (formatted). Computed lazily via useState initializer is not
      // possible (dialog stays mounted), so set it inside the effect but async-safe.
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot "today" snapshot when the dialog opens
      setReceiptDate(`${y}-${m}-${d}`)
    }
  }, [open, payment])

  if (!payment) return null

  // Use receipt language for i18n — always pass the key with lng override
  const rt = (key: string, variables?: Record<string, string | number>): string => {
    // react-i18next handles variables via the options object; merging lng into it keeps
    // the receipt language independent of the app UI language.
    if (variables) {
      return t(key, { ...variables, lng: receiptLang })
    }
    return t(key, { lng: receiptLang })
  }

  // Helper: format date in the receipt language
  const formatDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-')
    const monthNum = parseInt(m, 10)
    if (receiptLang === 'ar') {
      const monthName = t(`reports.months.${monthNum}`, { lng: 'ar' })
      return `${d} ${monthName} ${y}`
    }
    const monthName = t(`reports.months.${monthNum}`, { lng: 'en' })
    return `${monthName} ${d}, ${y}`
  }

  // Format amount with locale. CONSTRAINT: always Western (Latin) numerals even in
  // Arabic receipts — ar-u-nu-latn overrides the default Arabic-Indic digit shaping.
  const formatAmount = (amount: number, currency: string): string => {
    try {
      return (
        new Intl.NumberFormat(receiptLang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount) +
        ' ' +
        currency
      )
    } catch {
      return amount.toLocaleString('en-US') + ' ' + currency
    }
  }

  // Only show non-voided receipt content
  const isVoided = payment.is_voided === 1

  const handlePrint = (): void => {
    if (!isVoided) {
      window.print()
    }
  }

  const paymentTypeLabel =
    receiptLang === 'ar'
      ? payment.payment_type === 'rent'
        ? rt('payment.rent')
        : payment.payment_type === 'deposit'
          ? rt('payment.deposit')
          : rt('payment.otherIncome')
      : payment.payment_type === 'rent'
        ? rt('payment.rent')
        : payment.payment_type === 'deposit'
          ? rt('payment.deposit')
          : rt('payment.otherIncome')

  // Parse related_period_month into human-readable periods — format each using receipt language
  const periodsDisplay: string[] = []
  if (payment.related_period_month) {
    const parts = payment.related_period_month.split(',')
    for (const p of parts) {
      periodsDisplay.push(formatPeriodMonth(p.trim(), rt))
    }
  }

  // Supplementary note lines: remaining due as of this payment's date (future dues
  // excluded) and the previous payment. Rendered as small muted text under Notes —
  // extra context only, never competing with the paid amount.
  const remainingNoteLines: string[] = []
  if (receiptContext && receiptContext.outstanding > 0) {
    remainingNoteLines.push(
      rt('receipt.noteRemainingDue', {
        amount: formatAmount(receiptContext.outstanding, receiptContext.currency)
      })
    )
  }
  if (receiptContext?.last_payment) {
    remainingNoteLines.push(
      rt('receipt.noteLastPayment', {
        date: formatDate(receiptContext.last_payment.date),
        receiptNo: receiptContext.last_payment.receipt_number,
        amount: formatAmount(receiptContext.last_payment.amount, receiptContext.currency)
      })
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth dir={isRtl ? 'rtl' : 'ltr'}>
      <DialogTitle
        sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h6" component="span">
          {rt('receipt.title')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {/* Voided banner */}
        {isVoided ? (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              mb: 2,
              bgcolor: 'error.light',
              color: 'error.contrastText',
              border: '1px solid',
              borderColor: 'error.main',
              borderRadius: 2,
              textAlign: 'center'
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              {rt('receipt.voidedBanner')}
            </Typography>
            {payment.void_reason && (
              <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
                {rt('receipt.voidReason', { reason: payment.void_reason })}
              </Typography>
            )}
          </Paper>
        ) : null}

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
            position: 'relative',
            opacity: isVoided ? 0.5 : 1
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
                  alt={companySettings?.company_name || rt('receipt.defaultCompany')}
                  sx={{ maxHeight: 60, maxWidth: 180, objectFit: 'contain', mb: 1 }}
                />
              ) : null}
              <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                {companySettings?.company_name || rt('receipt.defaultCompany')}
              </Typography>
              {companySettings?.company_address && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {companySettings.company_address}
                </Typography>
              )}
              {(companySettings?.company_phone || companySettings?.company_email) && (
                <Typography variant="body2" color="text.secondary">
                  {companySettings.company_phone && (
                    <span dir="ltr">{companySettings.company_phone}</span>
                  )}
                  {companySettings.company_phone && companySettings.company_email && (
                    <span style={{ margin: '0 4px' }}>|</span>
                  )}
                  {companySettings.company_email && (
                    <span dir="ltr">{companySettings.company_email}</span>
                  )}
                </Typography>
              )}
            </Box>
            <Box sx={{ textAlign: 'end' }}>
              <Typography variant="subtitle2" color="text.secondary">
                {rt('receipt.receiptNumber')}
              </Typography>
              <Typography variant="h6" color="primary.main" sx={{ fontWeight: 'bold' }}>
                {payment.receipt_number || `#${payment.id}`}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {rt('receipt.paymentDate')}: {formatDate(payment.payment_date)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {rt('receipt.issueDate')}: {formatDate(receiptDate)}
              </Typography>
            </Box>
          </Box>

          {/* Payment Details Grid */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {rt('common.tenant')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.tenant_fullname || rt('common.none')}
              </Typography>
              {payment.tenant_phone && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.25, direction: 'ltr' }}
                >
                  {payment.tenant_phone}
                </Typography>
              )}
              {payment.tenant_email && (
                <Typography variant="body2" color="text.secondary" sx={{ direction: 'ltr' }}>
                  {payment.tenant_email}
                </Typography>
              )}
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {rt('common.property')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.property_code
                  ? `${payment.property_code} — ${payment.property_name}`
                  : payment.property_name}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {rt('payment.paymentType')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {paymentTypeLabel}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {rt('payment.paymentMethod')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {payment.payment_method
                  ? rt(
                      `payment.method${payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)}`
                    )
                  : rt('common.none')}
              </Typography>
            </Grid>

            {payment.contract_number ? (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  {rt('contract.contractNumber')}
                </Typography>
                <Typography variant="body2">{payment.contract_number}</Typography>
              </Grid>
            ) : null}

            {periodsDisplay.length > 0 ? (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  {rt('receipt.periodsCovered')}
                </Typography>
                <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                  {periodsDisplay.join(' — ')}
                </Typography>
              </Grid>
            ) : null}

            {payment.notes || remainingNoteLines.length > 0 ? (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  {rt('common.notes')}
                </Typography>
                {payment.notes && (
                  <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                    {payment.notes}
                  </Typography>
                )}
                {/* Extra context (remaining due, previous payment) — deliberately styled as
                    small muted note lines so it reads as supplementary info, never competing
                    with the paid amount. */}
                {remainingNoteLines.map((line) => (
                  <Typography
                    key={line}
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.25 }}
                  >
                    {line}
                  </Typography>
                ))}
              </Grid>
            ) : null}
          </Grid>

          {/* Amount Paid Box — shows ONLY this receipt's payment amount, nothing computed */}
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
              {rt('receipt.totalPaid')}
            </Typography>
            <Typography variant="h5" color="success.main" sx={{ fontWeight: 'bold' }}>
              {formatAmount(payment.amount, payment.currency)}
            </Typography>
          </Box>

          {/* Footer signature line */}
          <Box sx={{ mt: 5, pt: 3, display: 'flex', justifyContent: 'space-between' }}>
            <Box sx={{ width: 160, textAlign: 'center' }}>
              <Divider sx={{ mb: 1, borderColor: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {rt('receipt.payerSignature')}
              </Typography>
            </Box>
            <Box sx={{ width: 160, textAlign: 'center' }}>
              <Divider sx={{ mb: 1, borderColor: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {rt('receipt.authorizedSignature')}
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
            {rt('receipt.paidStamp')}
          </Box>
        </Paper>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          {rt('common.close')}
        </Button>
        <Button
          onClick={handlePrint}
          variant="contained"
          startIcon={<PrintIcon />}
          disabled={isVoided}
        >
          {rt('receipt.print')}
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
