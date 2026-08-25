/**
 * INTENT: The printable receipt body — company header, transaction details grid,
 *         amount box, signature lines, and PAID stamp. Used by ReceiptDialog in both
 *         compact and fullscreen modes; identical markup either way so printing works
 *         from both.
 *
 * CONSTRAINT: i18n keys only via the receipt-language override, theme.palette colors,
 *         logical CSS properties, Western numerals even in Arabic receipts.
 *
 * DECISION: Owns its formatting helpers (dates/amounts/i18n) keyed off receiptLang so
 *         ReceiptDialog stays under the 500-line limit and view-mode concerns stay
 *         separated from document rendering.
 */
import { Box, Divider, Grid, Typography, Paper } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ReceiptPaymentData } from './ReceiptDialog'

export interface ReceiptPaperCompanySettings {
  company_name: string | null
  company_logo: string | null
  /** Base64 image of the company's authorized signature; rendered above the signature line. */
  company_signature: string | null
  /** Name of the person authorized to sign; printed under the signature. */
  company_signer_name: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
}

export interface ReceiptPaperContext {
  /** Dues billed up to (and incl.) this payment's date minus payments through that date. */
  outstanding: number
  currency: string
  last_payment: {
    date: string
    amount: number
    receipt_number: string
  } | null
}

interface ReceiptPaperProps {
  payment: ReceiptPaymentData
  companySettings: ReceiptPaperCompanySettings | null
  receiptContext: ReceiptPaperContext | null
  /** Today's date (YYYY-MM-DD) captured when the dialog opened. */
  receiptDate: string
  /** 'ar' renders everything in Arabic, anything else in English. */
  receiptLang: 'ar' | 'en'
  /** Outer padding scale — compact in dialog, roomier in fullscreen. */
  padOuter: number
  /** Vertical gap scale between sections. */
  gapSection: number
}

/** Format a YYYY-MM string into a readable month name using the given translation function. */
function formatPeriodMonth(yyyymm: string, t: (key: string) => string): string {
  const [year, month] = yyyymm.split('-')
  const monthNum = parseInt(month, 10)
  const monthName = t(`reports.months.${monthNum}`)
  return `${monthName} ${year}`
}

export function ReceiptPaper({
  payment,
  companySettings,
  receiptContext,
  receiptDate,
  receiptLang,
  padOuter,
  gapSection
}: ReceiptPaperProps): React.ReactElement {
  const { t } = useTranslation()

  // Use receipt language for i18n — always pass the key with lng override
  const rt = (key: string, variables?: Record<string, string | number>): string => {
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

  const isVoided = payment.is_voided === 1

  const paymentTypeLabel =
    payment.payment_type === 'rent'
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
    <Paper
      elevation={0}
      className="printable-receipt"
      sx={{
        p: padOuter,
        border: '1px solid',
        borderColor: 'divider',
        borderTop: '4px solid',
        borderTopColor: 'primary.main',
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
          alignItems: 'flex-start',
          mb: gapSection + 0.5,
          pb: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Box>
          {companySettings?.company_logo ? (
            <Box
              component="img"
              src={companySettings.company_logo}
              alt={companySettings?.company_name || rt('receipt.defaultCompany')}
              sx={{ maxHeight: 48, maxWidth: 160, objectFit: 'contain', mb: 0.5 }}
            />
          ) : null}
          <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold', letterSpacing: 0.2 }}>
            {companySettings?.company_name || rt('receipt.defaultCompany')}
          </Typography>
          {companySettings?.company_address && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.25 }}
            >
              {companySettings.company_address}
            </Typography>
          )}
          {(companySettings?.company_phone || companySettings?.company_email) && (
            <Typography variant="caption" color="text.secondary">
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
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {rt('receipt.paymentDate')}: {formatDate(payment.payment_date)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {rt('receipt.issueDate')}: {formatDate(receiptDate)}
          </Typography>
        </Box>
      </Box>

      {/* Payment Details Grid */}
      <Grid container spacing={gapSection} sx={{ mb: gapSection }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Typography variant="caption" color="text.secondary">
            {rt('common.tenant')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {payment.tenant_fullname || rt('common.none')}
          </Typography>
          {payment.tenant_phone && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.25, direction: 'ltr' }}
            >
              {payment.tenant_phone}
            </Typography>
          )}
          {payment.tenant_email && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', direction: 'ltr' }}
            >
              {payment.tenant_email}
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Typography variant="caption" color="text.secondary">
            {rt('common.property')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {payment.property_code
              ? `${payment.property_code} — ${payment.property_name}`
              : payment.property_name}
          </Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary">
            {rt('payment.paymentType')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {paymentTypeLabel}
          </Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary">
            {rt('payment.paymentMethod')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {payment.payment_method
              ? rt(
                  `payment.method${payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)}`
                )
              : rt('common.none')}
          </Typography>
        </Grid>

        {payment.contract_number ? (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {rt('contract.contractNumber')}
            </Typography>
            <Typography variant="body2">{payment.contract_number}</Typography>
          </Grid>
        ) : null}

        {periodsDisplay.length > 0 ? (
          <Grid size={{ xs: 12, sm: 6 }}>
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
          px: 2,
          py: 1.25,
          borderRadius: 1.5,
          bgcolor: 'success.main',
          color: 'success.contrastText'
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
          {rt('receipt.totalPaid')}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
          {formatAmount(payment.amount, payment.currency)}
        </Typography>
      </Box>

      {/* Authorized-signature block — payer line removed (v1.9): the company is the
          issuing party, so only its authorized signer signs. Signature image and/or
          signer name appear automatically above/under the line when configured. */}
      <Box
        className="signature-row"
        sx={{
          mt: 2.5,
          pt: 1.5,
          display: 'flex',
          justifyContent: 'flex-end'
        }}
      >
        <Box sx={{ width: 200, textAlign: 'center' }}>
          {companySettings?.company_signature ? (
            <Box
              component="img"
              src={companySettings.company_signature}
              alt={rt('receipt.authorizedSignature')}
              className="signature-image"
              sx={{
                height: 44,
                maxWidth: 180,
                objectFit: 'contain',
                objectPosition: 'bottom center',
                mx: 'auto',
                display: 'block',
                pointerEvents: 'none'
              }}
            />
          ) : null}
          <Divider sx={{ mb: 0.75, borderColor: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {rt('receipt.authorizedSignature')}
          </Typography>
          {companySettings?.company_signer_name && (
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
              {companySettings.company_signer_name}
            </Typography>
          )}
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
  )
}

export default ReceiptPaper
