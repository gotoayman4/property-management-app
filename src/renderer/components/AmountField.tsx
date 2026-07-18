import React from 'react'
import { TextField, Box, Typography } from '@mui/material'
import { Controller, type ControllerProps, type FieldPath, type FieldValues } from 'react-hook-form'

/**
 * INTENT: Spinner-less numeric input bound to React Hook Form.
 * CONSTRAINT: AGENTS bans <TextField type="number"> with a spinner. MUI v9.2.0 ships no
 *             NumberField component, so this provides the equivalent: numeric semantics with
 *             hidden native spinners and blocked mouse-wheel changes (per form-patterns.md
 *             "spinner-less number input").
 * DECISION: Keep type="text" with inputMode="decimal" for cross-locale numeric entry; parse
 *           empty string to null so optional numeric fields clear cleanly.
 */

interface AmountFieldProps<T extends FieldValues, N extends FieldPath<T>> {
  name: N
  control: ControllerProps<T, N>['control']
  label: string
  /** When true the field is required and shows the required marker. */
  required?: boolean
  disabled?: boolean
  errorText?: string
  /** Minimum allowed numeric value (inclusive). */
  min?: number
  /** When true, empty input maps to null instead of 0 (for optional fields). */
  allowEmpty?: boolean
  /** Optional node rendered as an inline-end adornment (e.g. a currency code). */
  endAdornment?: React.ReactNode
}

export function AmountField<T extends FieldValues, N extends FieldPath<T>>({
  name,
  control,
  label,
  required = false,
  disabled = false,
  errorText,
  min,
  allowEmpty = true,
  endAdornment
}: AmountFieldProps<T, N>): React.JSX.Element {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const display = field.value === null || field.value === undefined ? '' : String(field.value)
        return (
          <TextField
            {...field}
            value={display}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                field.onChange(allowEmpty ? null : 0)
                return
              }
              const parsed = Number(raw)
              field.onChange(Number.isNaN(parsed) ? (allowEmpty ? null : 0) : parsed)
            }}
            // Block mouse-wheel from accidentally changing the value.
            onWheel={(e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
            label={label}
            required={required}
            disabled={disabled}
            error={!!errorText}
            helperText={errorText}
            slotProps={{
              input: endAdornment
                ? { endAdornment: <span aria-hidden>{endAdornment}</span> }
                : undefined,
              htmlInput: {
                inputMode: 'decimal',
                min,
                sx: {
                  // Hide the native number spinners across browsers (spinner-less requirement).
                  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                    WebkitAppearance: 'none',
                    margin: 0
                  },
                  MozAppearance: 'textfield'
                }
              }
            }}
            fullWidth
          />
        )
      }}
    />
  )
}

/**
 * INTENT: Read-only converted-amount display rendered beside a monetary AmountField.
 * CONSTRAINT: Per FR-FX-04..06 — the Convert control is display-only; it never alters the
 *             stored currency/amount. The conversion is computed by the parent and passed in
 *             (the exchange_rates IPC is added in the Currency module phase).
 * DECISION: A pure presentational chip so forms can compose it without coupling to the
 *           (not-yet-built) exchange-rate data source.
 */
export function ConversionPreview({
  convertedAmount,
  currency,
  rateDate,
  noRateLabel
}: {
  convertedAmount: number | null
  currency: string
  rateDate?: string
  noRateLabel: string
}): React.JSX.Element {
  if (convertedAmount === null) {
    return (
      <Typography variant="caption" color="text.secondary">
        {noRateLabel}
      </Typography>
    )
  }
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(convertedAmount)
  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        ≈ {formatted}
        {rateDate ? ` · ${rateDate}` : ''}
      </Typography>
    </Box>
  )
}
