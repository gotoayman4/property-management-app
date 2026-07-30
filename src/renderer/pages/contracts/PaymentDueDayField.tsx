/**
 * INTENT: Day-of-month due-day picker for contract payment periods (1 = start of month,
 *         31 = clamped to the month's last day). The value drives rent_dues due_date
 *         generation and the due-day rent notifications.
 * CONSTRAINT: Extracted as a sibling component to keep ContractForm under the 500-line limit.
 */
import { FormHelperText, Grid } from '@mui/material'
import React from 'react'
import { type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { AmountField } from '../../components/AmountField'

interface PaymentDueDayFieldProps<T extends FieldValues> {
  control: Control<T>
  /** True when the bound payment_due_day field currently fails validation. */
  hasError?: boolean
}

export function PaymentDueDayField<T extends FieldValues>({
  control,
  hasError = false
}: PaymentDueDayFieldProps<T>): React.ReactElement {
  const { t } = useTranslation()
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <AmountField
        name={'payment_due_day' as FieldPath<T>}
        control={control}
        label={t('contract.dueDay')}
        required
        allowEmpty={false}
        min={1}
        max={31}
        errorText={hasError ? t('contract.dueDayInvalid') : undefined}
      />
      {!hasError && <FormHelperText>{t('contract.dueDayHelp')}</FormHelperText>}
    </Grid>
  )
}
