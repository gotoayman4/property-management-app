/**
 * @file CoveredPeriodPicker — Covered period year & multi-month selection component for PaymentForm.
 * INTENT: Isolates year dropdown and multi-month chip selection for payment period tagging.
 */
import {
  Box,
  Checkbox,
  Chip,
  FormControl,
  FormHelperText,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Typography
} from '@mui/material'
import React from 'react'
import { FieldError } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

interface CoveredPeriodPickerProps {
  periodYear: number
  onYearChange: (year: number) => void
  periodMonths: number[]
  onMonthsChange: (months: number[]) => void
  yearOptions: number[]
  monthKeys: readonly string[]
  error?: FieldError
}

export function CoveredPeriodPicker({
  periodYear,
  onYearChange,
  periodMonths,
  onMonthsChange,
  yearOptions,
  monthKeys,
  error
}: CoveredPeriodPickerProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {t('payment.relatedPeriod')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {/* Year selector */}
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>{t('payment.relatedPeriodYear')}</InputLabel>
          <Select
            label={t('payment.relatedPeriodYear')}
            value={periodYear}
            onChange={(e) => {
              onYearChange(Number(e.target.value))
              onMonthsChange([])
            }}
          >
            {yearOptions.map((y) => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Month multi-select chips */}
        <FormControl fullWidth error={!!error} sx={{ flex: 1 }}>
          <InputLabel>{t('payment.relatedPeriodMonths')}</InputLabel>
          <Select
            multiple
            label={t('payment.relatedPeriodMonths')}
            value={periodMonths}
            onChange={(e) => {
              const val = e.target.value
              onMonthsChange(
                typeof val === 'string' ? val.split(',').map(Number) : (val as number[])
              )
            }}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {(selected as number[])
                  .slice()
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <Chip
                      key={m}
                      label={monthKeys[m - 1]}
                      size="small"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDelete={() => onMonthsChange(periodMonths.filter((x) => x !== m))}
                    />
                  ))}
              </Box>
            )}
          >
            {monthKeys.map((label, idx) => {
              const monthNum = idx + 1
              return (
                <MenuItem key={monthNum} value={monthNum}>
                  <Checkbox checked={periodMonths.includes(monthNum)} size="small" />
                  <ListItemText primary={label} />
                </MenuItem>
              )
            })}
          </Select>
          {error && <FormHelperText>{t(`payment.${error.message}`)}</FormHelperText>}
        </FormControl>
      </Box>
    </>
  )
}
