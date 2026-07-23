import { TextField, Box, Typography } from '@mui/material'
import React from 'react'
import { Controller, type ControllerProps, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()

  const displayLabel = !required ? (
    <>
      {label}{' '}
      <Typography component="span" variant="caption" color="text.secondary">
        ({t('common.optional')})
      </Typography>
    </>
  ) : (
    label
  )

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        return (
          <AmountFieldInner
            field={field}
            allowEmpty={allowEmpty}
            displayLabel={displayLabel}
            required={required}
            disabled={disabled}
            errorText={errorText}
            min={min}
            endAdornment={endAdornment}
          />
        )
      }}
    />
  )
}

interface AmountFieldInnerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: any
  allowEmpty: boolean
  displayLabel: React.ReactNode
  required: boolean
  disabled: boolean
  errorText?: string
  min?: number
  endAdornment?: React.ReactNode
}

function AmountFieldInner({
  field,
  allowEmpty,
  displayLabel,
  required,
  disabled,
  errorText,
  min,
  endAdornment
}: AmountFieldInnerProps): React.JSX.Element {
  const [localVal, setLocalVal] = React.useState<string>(
    field.value === null || field.value === undefined ? '' : String(field.value)
  )
  const [prevFieldVal, setPrevFieldVal] = React.useState(field.value)

  if (field.value !== prevFieldVal) {
    setPrevFieldVal(field.value)
    const parsedLocal = parseFloat(localVal)
    if (field.value !== (Number.isNaN(parsedLocal) ? (allowEmpty ? null : 0) : parsedLocal)) {
      setLocalVal(field.value === null || field.value === undefined ? '' : String(field.value))
    }
  }

  return (
    <TextField
      {...field}
      value={localVal}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value
        if (/^[0-9]*[.,]?[0-9]*$/.test(raw)) {
          setLocalVal(raw)
          if (raw === '' || raw === '.' || raw === ',') {
            field.onChange(allowEmpty ? null : 0)
            return
          }
          const normalized = raw.replace(',', '.')
          const parsed = Number(normalized)
          if (!Number.isNaN(parsed)) {
            field.onChange(parsed)
          }
        }
      }}
      onBlur={() => {
        field.onBlur()
        if (localVal === '' || localVal === '.' || localVal === ',') {
          field.onChange(allowEmpty ? null : 0)
        }
      }}
      onWheel={(e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
      label={displayLabel}
      required={required}
      disabled={disabled}
      error={!!errorText}
      helperText={errorText}
      slotProps={{
        input: endAdornment ? { endAdornment: <span aria-hidden>{endAdornment}</span> } : undefined,
        htmlInput: {
          dir: 'ltr',
          inputMode: 'decimal',
          min,
          sx: {
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
