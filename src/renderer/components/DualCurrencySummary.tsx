import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Chip,
  CircularProgress
} from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConversionResult } from '../hooks/useCurrencyConversion'
import { numericInputSx } from '../utils/numericInputSx'

interface DualCurrencySummaryProps {
  amount: number
  nativeCurrency: string
  reportingCurrency: string
  conversion: ConversionResult | null
  onFetchOnline: () => Promise<void>
  isFetching?: boolean
  customRate: number | null
  onCustomRateChange: (rate: number | null) => void
}

export function DualCurrencySummary({
  amount,
  nativeCurrency,
  reportingCurrency,
  conversion,
  onFetchOnline,
  isFetching = false,
  customRate,
  onCustomRateChange
}: DualCurrencySummaryProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [useCustom, setUseCustom] = useState<boolean>(customRate !== null && customRate > 0)

  if (!nativeCurrency || !reportingCurrency || amount <= 0) {
    return null
  }

  // Same currency — no conversion needed
  if (nativeCurrency === reportingCurrency) {
    return null
  }

  const effectiveRate =
    useCustom && customRate && customRate > 0
      ? customRate
      : conversion?.convertedAmount && amount > 0
        ? conversion.convertedAmount / amount
        : null

  const consolidatedAmount = effectiveRate && amount > 0 ? amount * effectiveRate : null

  const handleToggleCustom = (checked: boolean): void => {
    setUseCustom(checked)
    if (!checked) {
      onCustomRateChange(null)
    } else if (effectiveRate) {
      onCustomRateChange(effectiveRate)
    }
  }

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        p: 2,
        mt: 1.5,
        borderRadius: 2,
        borderColor: 'divider',
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'action.hover' : 'grey.50')
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 600 }}>
          {t('currency.dualCurrencySummary')}
        </Typography>
        <Chip
          label={`${t('reports.showInReportingCurrency', { currency: reportingCurrency })}`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ fontSize: '0.72rem' }}
        />
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {t('currency.nativeAmount')}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {amount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{' '}
            <Typography component="span" variant="body2" color="text.secondary">
              {nativeCurrency}
            </Typography>
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {t('currency.consolidatedAmount')} ({reportingCurrency})
          </Typography>
          <Typography
            variant="h6"
            color={consolidatedAmount !== null ? 'success.main' : 'text.disabled'}
            sx={{ fontWeight: 700 }}
          >
            {consolidatedAmount !== null
              ? consolidatedAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              : '—'}{' '}
            <Typography component="span" variant="body2" color="text.secondary">
              {reportingCurrency}
            </Typography>
          </Typography>
        </Box>
      </Box>

      {/* Effective Rate and Action Toolbar */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mt: 2,
          pt: 1.5,
          borderTop: 1,
          borderColor: 'divider'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {effectiveRate
              ? `1 ${nativeCurrency} = ${effectiveRate.toFixed(4)} ${reportingCurrency}`
              : t('common.noRateAvailable')}
          </Typography>
          {conversion?.rateDate && !useCustom && (
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.8 }}>
              ({t('currency.effectiveDate')}: {conversion.rateDate})
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="text"
            startIcon={isFetching ? <CircularProgress size={14} /> : <CloudDownloadIcon />}
            onClick={onFetchOnline}
            disabled={isFetching}
            sx={{ fontSize: '0.75rem', py: 0.2 }}
          >
            {t('currency.autoFetchInline')}
          </Button>

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={useCustom}
                onChange={(e) => handleToggleCustom(e.target.checked)}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                {t('currency.useCustomRate')}
              </Typography>
            }
            sx={{ m: 0 }}
          />
        </Box>
      </Box>

      {/* Custom Rate Input Field */}
      {useCustom && (
        <Box sx={{ mt: 1.5 }}>
          <CustomRateInputField
            nativeCurrency={nativeCurrency}
            reportingCurrency={reportingCurrency}
            customRate={customRate}
            onCustomRateChange={onCustomRateChange}
            t={t}
          />
        </Box>
      )}
    </Paper>
  )
}

function CustomRateInputField({
  nativeCurrency,
  reportingCurrency,
  customRate,
  onCustomRateChange,
  t
}: {
  nativeCurrency: string
  reportingCurrency: string
  customRate: number | null
  onCustomRateChange: (rate: number | null) => void
  t: (key: string, options?: Record<string, unknown>) => string
}): React.JSX.Element {
  const [localInput, setLocalInput] = useState<string>(
    customRate !== null ? String(customRate) : ''
  )
  const [prevRate, setPrevRate] = useState<number | null>(customRate)

  if (customRate !== prevRate) {
    setPrevRate(customRate)
    const parsedLocal = parseFloat(localInput)
    if (customRate !== parsedLocal) {
      setLocalInput(customRate !== null ? String(customRate) : '')
    }
  }

  return (
    <TextField
      fullWidth
      size="small"
      type="text"
      inputMode="decimal"
      label={`${t('currency.customRate')} (1 ${nativeCurrency} = ? ${reportingCurrency})`}
      value={localInput}
      onChange={(e) => {
        const raw = e.target.value
        setLocalInput(raw)
        const val = parseFloat(raw)
        onCustomRateChange(isNaN(val) || val <= 0 ? null : val)
      }}
      onBlur={() => {
        if (localInput === '' || localInput === '.') {
          onCustomRateChange(null)
        }
      }}
      slotProps={{ htmlInput: { min: 0, step: 'any', sx: numericInputSx } }}
    />
  )
}
