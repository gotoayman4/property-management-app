import React from 'react'
import { Box } from '@mui/material'
import { AmountField, ConversionPreview } from './AmountField'
import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form'

/**
 * INTENT: Monetary amount field with a read-only currency-code adornment and optional
 *         display-only live conversion preview.
 * CONSTRAINT: The 3-letter currency code is shown non-editable (the property/contract currency).
 *             The conversion is display-only and never mutates the stored amount (BR-13, FR-FX-06).
 * CAVEAT: The exchange_rates IPC is added in the Currency module (M-09) phase. Until then the
 *         parent passes `conversion={null}` and the field shows the "no rate" label gracefully —
 *         no silent TODO; the gap is stated here and surfaced in the chat response.
 */

export interface CurrencyConversion {
  convertedAmount: number | null
  currency: string
  rateDate?: string
}

interface CurrencyInputProps<T extends FieldValues, N extends FieldPath<T>> {
  name: N
  control: ControllerProps<T, N>['control']
  label: string
  /** 3-letter ISO currency code shown as a non-editable adornment. */
  currency: string
  required?: boolean
  disabled?: boolean
  errorText?: string
  /** Optional display-only conversion preview. Omit to hide conversion UI. */
  conversion?: CurrencyConversion | null
  noRateLabel: string
}

export function CurrencyInput<T extends FieldValues, N extends FieldPath<T>>({
  name,
  control,
  label,
  currency,
  required = false,
  disabled = false,
  errorText,
  conversion,
  noRateLabel
}: CurrencyInputProps<T, N>): React.JSX.Element {
  return (
    <Box>
      <AmountField
        name={name}
        control={control}
        label={label}
        required={required}
        disabled={disabled}
        errorText={errorText}
        endAdornment={<strong>{currency}</strong>}
      />
      {conversion && (
        <ConversionPreview
          convertedAmount={conversion.convertedAmount}
          currency={conversion.currency}
          rateDate={conversion.rateDate}
          noRateLabel={noRateLabel}
        />
      )}
    </Box>
  )
}
