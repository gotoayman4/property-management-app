import { Typography, TextField, type TextFieldProps } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import React from 'react'
import {
  Controller,
  type ControllerProps,
  type FieldErrors,
  type FieldPath,
  type FieldValues
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

/**
 * INTENT: A thin wrapper around React Hook Form's <Controller> + MUI <TextField> that
 *         visually distinguishes required fields (red asterisk via theme MuiFormLabel
 *         override) from optional fields (appends "(optional)" in muted secondary color).
 * CONSTRAINT: All user-facing strings use i18n keys. The red asterisk color comes from
 *             the theme (error.main), not inline styling.
 * DECISION: Accepts `errors` and `errorNamespace` so error messages are resolved via i18n
 *           automatically (matching the common pattern across forms). The `required` prop
 *           drives both the MUI asterisk and the optional-label display.
 * CAVEAT: For `setError()` calls where the message is already translated (not a key), pass
 *         `errorNamespace=""` or the message will be double-translated.
 */

interface FormFieldProps<T extends FieldValues, N extends FieldPath<T>> {
  name: N
  control: ControllerProps<T, N>['control']
  /** FieldErrors object from react-hook-form's formState.errors. */
  errors?: FieldErrors<T>
  /** i18n label key (already resolved via t()). */
  label: string
  /** When true, MUI renders the red asterisk (styled in theme). When false, appends "(optional)". */
  required?: boolean
  disabled?: boolean
  /**
   * Translation namespace prefix used to resolve error messages.
   * E.g. for tenant fields: 'tenant' → t('tenant.codeRequired').
   * If omitted, the error message is displayed as-is (for setError manual messages).
   */
  errorNamespace?: string
  multiline?: boolean
  rows?: number
  /** Input type (e.g. 'date' for date pickers). Default is 'text'. */
  type?: string
  placeholder?: string
  slotProps?: TextFieldProps['slotProps']
  sx?: SxProps<Theme>
}

export function FormField<T extends FieldValues, N extends FieldPath<T>>({
  name,
  control,
  errors,
  label,
  required = false,
  disabled = false,
  errorNamespace,
  multiline = false,
  rows,
  type = 'text',
  placeholder,
  slotProps,
  sx
}: FormFieldProps<T, N>): React.JSX.Element {
  const { t } = useTranslation()

  // Resolve error message
  const fieldError = errors?.[name] as { message?: string } | undefined
  let errorText: string | undefined
  if (fieldError?.message) {
    if (errorNamespace && errorNamespace.length > 0) {
      errorText = t(`${errorNamespace}.${fieldError.message}`)
    } else {
      errorText = fieldError.message
    }
  }

  // Build the label with optional suffix
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
        // Convert null/undefined to empty string for controlled inputs (optional fields)
        const value = field.value ?? ''
        return (
          <TextField
            {...field}
            value={value}
            onChange={(e) => {
              // For optional fields, preserve null if cleared
              if (!required && e.target.value === '') {
                field.onChange(null)
              } else {
                field.onChange(e.target.value)
              }
            }}
            label={displayLabel}
            required={required}
            disabled={disabled}
            error={!!errorText}
            helperText={errorText}
            multiline={multiline}
            rows={rows}
            type={type}
            placeholder={placeholder}
            slotProps={{
              ...slotProps,
              ...(type === 'date' ? { inputLabel: { shrink: true, ...slotProps?.inputLabel } } : {})
            }}
            sx={sx}
            fullWidth
          />
        )
      }}
    />
  )
}
