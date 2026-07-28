/**
 * INTENT: Increment calculator for manual renewal (flat mode). Computes the new rent from the
 *         prior rent using a regular annual increase % plus an optional one-time adjustment
 *         (percent or fixed amount), and pushes the result up to the parent form via callbacks
 *         (FR-CON-04). The user can still overtype the final rent afterwards.
 * CONSTRAINT: Presentation + local calculator state only — no IPC, no business rules beyond the
 *             documented rent math. Extracted to keep ContractRenewalForm under the 500-line limit.
 */
import { Box, Divider, Grid, MenuItem, TextField, Typography } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { round2 } from '../../utils/contractDates'
import { numericInputSx } from '../../utils/numericInputSx'

type OneTimeMode = 'percent' | 'amount'

interface RenewalIncrementPanelProps {
  /** The prior term's rent — the base the increment is computed from. */
  baseRent: number
  currency: string
  /** Pushes the computed rent + regular % up to the parent (via setValue). */
  onComputed: (newRent: number, regularPercent: number | null) => void
  /** Reports the one-time adjustment description (or null) so the parent can append it to notes. */
  onOneTimeDescriptionChange: (description: string | null) => void
}

export function RenewalIncrementPanel({
  baseRent,
  currency,
  onComputed,
  onOneTimeDescriptionChange
}: RenewalIncrementPanelProps): React.ReactElement {
  const { t } = useTranslation()
  const [regularPercent, setRegularPercent] = useState('')
  const [oneTimeMode, setOneTimeMode] = useState<OneTimeMode>('percent')
  const [oneTimeValue, setOneTimeValue] = useState('')

  const regular = regularPercent === '' ? 0 : Number(regularPercent)
  const oneTime = oneTimeValue === '' ? 0 : Number(oneTimeValue)

  const afterRegular = round2(baseRent * (1 + regular / 100))
  const newRent = round2(
    oneTimeMode === 'percent' ? afterRegular * (1 + oneTime / 100) : afterRegular + oneTime
  )

  useEffect(() => {
    onComputed(newRent, regularPercent === '' ? null : regular)
    if (oneTime !== 0) {
      const desc =
        oneTimeMode === 'percent'
          ? t('contract.oneTimeNotePercent', { value: oneTime })
          : t('contract.oneTimeNoteAmount', { value: oneTime, currency })
      onOneTimeDescriptionChange(desc)
    } else {
      onOneTimeDescriptionChange(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRent, regular, oneTime, oneTimeMode])

  return (
    <Grid size={{ xs: 12 }}>
      <Divider sx={{ my: 1 }} />
      <Typography variant="subtitle2" gutterBottom>
        {t('contract.incrementHelper')}
      </Typography>
      <Grid container spacing={2} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            value={regularPercent}
            onChange={(e) => setRegularPercent(e.target.value)}
            label={t('contract.regularIncreasePercent')}
            type="text"
            inputMode="decimal"
            fullWidth
            sx={numericInputSx}
            slotProps={{ input: { endAdornment: <strong>%</strong> } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            select
            value={oneTimeMode}
            onChange={(e) => setOneTimeMode(e.target.value as OneTimeMode)}
            label={t('contract.oneTimeAdjustmentType')}
            fullWidth
          >
            <MenuItem value="percent">{t('contract.oneTimePercent')}</MenuItem>
            <MenuItem value="amount">{t('contract.oneTimeAmount')}</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            value={oneTimeValue}
            onChange={(e) => setOneTimeValue(e.target.value)}
            label={t('contract.oneTimeAdjustment')}
            type="text"
            inputMode="decimal"
            fullWidth
            sx={numericInputSx}
            slotProps={{
              input: {
                endAdornment: <strong>{oneTimeMode === 'percent' ? '%' : currency}</strong>
              }
            }}
          />
        </Grid>
      </Grid>
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t('contract.computedNewRent', { amount: newRent, currency })}
        </Typography>
      </Box>
    </Grid>
  )
}
