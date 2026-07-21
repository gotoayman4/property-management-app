/**
 * INTENT: Receipt numbering configuration card (FR-SET-10) — lets the user customize the
 *         receipt prefix and starting sequence number for auto-generated payment receipts.
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS.
 * DECISION: Extracted into a self-contained card to keep Settings.tsx under the 500-line limit.
 */
import ReceiptIcon from '@mui/icons-material/Receipt'
import { Box, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnackbar } from '../hooks/useSnackbar'

interface ReceiptSettings {
  receipt_prefix?: string
  receipt_starting_sequence?: number
}

interface ReceiptSettingsCardProps {
  /** When true, renders content without Card/CardContent wrapper (for embedding in SettingsSection). */
  compact?: boolean
}

const SPINNER_LESS = {
  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0
  },
  MozAppearance: 'textfield'
} as const

export default function ReceiptSettingsCard({
  compact = false
}: ReceiptSettingsCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { showSuccess, showError } = useSnackbar()
  const [settings, setSettings] = useState<ReceiptSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const data = (await window.api.settings.get()) as ReceiptSettings
        if (!cancelled) setSettings(data)
      } catch {
        if (!cancelled) showError('common.error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showError])

  const updateField = async (
    field: keyof ReceiptSettings,
    value: string | number
  ): Promise<void> => {
    try {
      await window.api.settings.update({ [field]: value })
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))
      showSuccess('common.saveSuccess')
    } catch {
      showError('common.saveError')
    }
  }

  if (!settings) return <></>

  const year = new Date().getUTCFullYear()
  const preview = `${settings.receipt_prefix || 'RCT'}-${year}-000001`

  const content = (
    <>
      <TextField
        fullWidth
        label={t('settings.receiptPrefix')}
        value={settings.receipt_prefix ?? ''}
        onChange={(e) => updateField('receipt_prefix', e.target.value)}
        helperText={t('settings.receiptPrefixHelp')}
        slotProps={{ htmlInput: { dir: 'ltr', maxLength: 20 } }}
        sx={{ mb: 2.5 }}
      />

      <TextField
        fullWidth
        type="text"
        inputMode="decimal"
        label={t('settings.receiptStartingSequence')}
        value={settings.receipt_starting_sequence ?? 1}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n >= 1) {
            updateField('receipt_starting_sequence', Math.min(n, 999999))
          }
        }}
        helperText={t('settings.receiptStartingSequenceHelp')}
        slotProps={{
          htmlInput: { dir: 'ltr', min: 1, max: 999999, sx: SPINNER_LESS }
        }}
        sx={{ mb: 2.5 }}
      />

      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
        {t('settings.receiptPreview')}: {preview}
      </Typography>
    </>
  )

  if (compact) return content

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2.5, alignItems: 'center' }}>
          <ReceiptIcon color="action" />
          <Box>
            <Typography variant="h5">{t('settings.receiptNumbering')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('settings.receiptNumberingHelp')}
            </Typography>
          </Box>
        </Stack>
        {content}
      </CardContent>
    </Card>
  )
}
