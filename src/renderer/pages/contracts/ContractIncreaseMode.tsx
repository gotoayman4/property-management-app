/**
 * INTENT: Handles the "increase mode" toggle (flat vs variable) and the corresponding
 *         form fields for contract rent escalation (FR-CON-09, FR-CON-13).
 * CONSTRAINT: Extracted from ContractForm to keep file size under 500 lines.
 */
import {
  TextField,
  FormControl,
  Grid,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormLabel,
  Divider
} from '@mui/material'
import React from 'react'
import { Controller, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { ContractFormValues, IncreaseMode } from './ContractForm'
import { EscalationScheduleEditor, type EscalationRow } from './EscalationScheduleEditor'

interface ContractIncreaseModeProps {
  increaseMode: IncreaseMode
  onIncreaseModeChange: (mode: IncreaseMode) => void
  schedule: EscalationRow[]
  onScheduleChange: (rows: EscalationRow[]) => void
  startDate: string
  rentAmount: number
  currency: string
  control: Control<ContractFormValues>
}

export function ContractIncreaseMode({
  increaseMode,
  onIncreaseModeChange,
  schedule,
  onScheduleChange,
  startDate,
  rentAmount,
  currency,
  control
}: ContractIncreaseModeProps): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'

  return (
    <>
      {/* Increase mode toggle (FR-CON-09 / FR-CON-13) */}
      <Grid size={{ xs: 12 }}>
        <Divider sx={{ my: 1 }} />
        <FormControl component="fieldset">
          <FormLabel component="legend">{t('contract.increaseMode')}</FormLabel>
          <RadioGroup
            row
            value={increaseMode}
            onChange={(e) => onIncreaseModeChange(e.target.value as IncreaseMode)}
            sx={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}
          >
            <FormControlLabel value="flat" control={<Radio />} label={t('contract.flatMode')} />
            <FormControlLabel
              value="variable"
              control={<Radio />}
              label={t('contract.variableMode')}
            />
          </RadioGroup>
        </FormControl>
      </Grid>

      {increaseMode === 'flat' ? (
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="annual_increase_percent"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? null : Number(e.target.value))
                }
                label={t('contract.annualIncreasePercent')}
                fullWidth
              />
            )}
          />
        </Grid>
      ) : (
        <Grid size={{ xs: 12 }}>
          <EscalationScheduleEditor
            rows={schedule}
            onChange={onScheduleChange}
            contractStartDate={startDate}
            baseRent={rentAmount}
            currency={currency}
          />
        </Grid>
      )}
    </>
  )
}
