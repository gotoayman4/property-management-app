/**
 * INTENT: Printable receipt dialog for payment records (FR-INC-06).
 * CONSTRAINT: i18n keys only, theme.palette colors, explicit dir, media print rules.
 *
 * DECISION: Supports a fullscreen view (footer toggle) so users can read the whole
 * receipt without the small-dialog constraint. The receipt body lives in ReceiptPaper
 * and is identical in both modes — only the Dialog's maxWidth changes (sm vs 100%)
 * and spacing tightens slightly. Print CSS targets .printable-receipt so printing
 * works from either mode.
 */
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import ImageIcon from '@mui/icons-material/Image'
import PrintIcon from '@mui/icons-material/Print'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@mui/material'
import { toPng } from 'html-to-image'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDirection } from '../hooks/useDirection'
import { useSnackbar } from '../hooks/useSnackbar'
import ReceiptPaper from './ReceiptPaper'

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
  company_signature: string | null
  company_signer_name: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
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
  // CAVEAT: fullscreen state intentionally RESETS when a different payment is opened
  // so each new receipt starts in the compact default view.
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)
  const { showSuccess, showError } = useSnackbar()

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
            company_signature: s?.company_signature ?? null,
            company_signer_name: s?.company_signer_name ?? null,
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

      // Receipt date = today. Set inside the effect since the component stays mounted
      // between openings and a useState initializer would only run once.
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot "today" snapshot when the dialog opens
      setReceiptDate(`${y}-${m}-${d}`)

      setIsFullscreen(false)
    }
  }, [open, payment])

  if (!payment) return null

  const rt = (key: string): string => t(key, { lng: receiptLang })

  // Only show non-voided receipt content
  const isVoided = payment.is_voided === 1

  const handlePrint = (): void => {
    if (!isVoided) {
      window.print()
    }
  }

  const handleToggleFullscreen = (): void => {
    setIsFullscreen((prev) => !prev)
  }

  // Compact vertical rhythm: tighter paddings in the small dialog; fullscreen widens
  // (capped at 720px for readability) instead of stretching edge-to-edge.
  const padOuter = isFullscreen ? 4 : 3

  if (!payment) return null

  // Export the rendered receipt as PNG: rasterize the receipt DOM node in the renderer
  // (html-to-image), then hand the data URL to the main process, which asks the user
  // where to save it and performs the atomic disk write (no renderer filesystem access).
  // NOTE: deliberately a plain function, NOT useCallback — this component returns early
  // when `payment` is null, and any hook below that early return would violate the
  // rules of hooks ("Rendered more hooks than during the previous render").
  const handleExportPng = async (): Promise<void> => {
    const node = receiptRef.current?.querySelector('.printable-receipt')
    if (!node) return
    setExportingPng(true)
    try {
      const dataUrl = await toPng(node as HTMLElement, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true
      })
      const fileName = `${payment.receipt_number || `receipt-${payment.id}`}`
      const result = await window.api.dialog.saveReceiptImage({ dataUrl, fileName })
      if (result.filePath) showSuccess('receipt.pngSaved')
    } catch {
      showError('common.saveError')
    } finally {
      setExportingPng(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={isFullscreen ? false : 'sm'}
      fullWidth
      dir={isRtl ? 'rtl' : 'ltr'}
      slotProps={{
        paper: {
          sx: {
            height: isFullscreen ? '100vh' : undefined,
            maxHeight: isFullscreen ? '100vh' : undefined
          }
        }
      }}
    >
      <DialogTitle
        sx={{
          m: 0,
          px: 2,
          py: 1.25,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Typography variant="h6" component="span">
          {rt('receipt.title')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 2.5, py: 1.5 }}>
        {/* Voided banner */}
        {isVoided ? (
          <Box
            sx={{
              p: 1.5,
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
                {t('receipt.voidReason', { lng: receiptLang, reason: payment.void_reason })}
              </Typography>
            )}
          </Box>
        ) : null}

        <Box
          ref={receiptRef}
          sx={{
            mx: isFullscreen ? 'auto' : 0,
            maxWidth: isFullscreen ? 720 : '100%'
          }}
        >
          <ReceiptPaper
            payment={payment}
            companySettings={companySettings}
            receiptContext={receiptContext}
            receiptDate={receiptDate}
            receiptLang={receiptLang}
            padOuter={padOuter}
            gapSection={isFullscreen ? 3 : 2}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">
          {rt('common.close')}
        </Button>
        <Button
          onClick={handleToggleFullscreen}
          startIcon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        >
          {isFullscreen ? rt('receipt.exitFullscreen') : rt('receipt.fullscreen')}
        </Button>
        <Button onClick={handleExportPng} startIcon={<ImageIcon />} disabled={exportingPng}>
          {exportingPng ? rt('receipt.exporting') : rt('receipt.exportPng')}
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
          /* Give signatures breathing room on paper even though they are compact on screen */
          .printable-receipt .signature-row {
            margin-top: 32px !important;
            padding-top: 16px !important;
          }
        }
      `}</style>
    </Dialog>
  )
}

export default ReceiptDialog
