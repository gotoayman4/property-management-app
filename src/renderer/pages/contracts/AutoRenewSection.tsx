/**
 * INTENT: Reusable "auto-renewal" opt-in block — a switch bound to `auto_renew` plus an optional
 *         fixed yearly increase % (`auto_renew_increase_percent`). Shared by ContractForm
 *         (create/edit) and ContractRenewalForm (arm-while-renewing) per FR-CON-04b.
 * CONSTRAINT: Auto-renewal is flat-mode only. In variable-escalation mode the switch is disabled
 *             with helper text (mirrors the AUTO_RENEW_REQUIRES_FLAT backend refine).
 * CONSTRAINT: Extracted as a sibling component to keep the parent forms under the 500-line limit.
 */
import { Box, Divider, FormControlLabel, Grid, Switch, Typography } from '@mui/material'
import React from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { AmountField } from '../../components/AmountField'

interface AutoRenewSectionProps<T extends FieldValues> {
  control: Control<T>
  /** True when the contract is in variable-escalation mode (auto-renew unavailable). */
  disabled?: boolean
}

export function AutoRenewSection<T extends FieldValues>({
  control,
  disabled = false
}: AutoRenewSectionProps<T>): React.ReactElement {
  const { t } = useTranslation()
  const autoRenewName = 'auto_renew' as FieldPath<T>
  const percentName = 'auto_renew_increase_percent' as FieldPath<T>

  return (
    <Grid size={{ xs: 12 }}>
      <Divider sx={{ my: 1 }} />
      <Controller
        name={autoRenewName}
        control={control}
        render={({ field }) => {
          const enabled = Number(field.value) === 1
          return (
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={enabled}
                    disabled={disabled}
                    onChange={(e) => field.onChange(e.target.checked ? 1 : 0)}
                  />
                }
                label={t('contract.autoRenewEnable')}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {disabled ? t('contract.autoRenewVariableDisabled') : t('contract.autoRenewHelp')}
              </Typography>
              {enabled && !disabled && (
                <Box sx={{ mt: 2, maxWidth: 320 }}>
                  <AmountField
                    name={percentName}
                    control={control}
                    label={t('contract.autoRenewIncreasePercent')}
                    min={0}
                    max={100}
                    endAdornment={<strong>%</strong>}
                  />
                </Box>
              )}
            </Box>
          )
        }}
      />
    </Grid>
  )
}
