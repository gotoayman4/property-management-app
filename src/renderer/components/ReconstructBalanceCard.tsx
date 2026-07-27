import AddIcon from '@mui/icons-material/Add'
import { Button, Grid, Paper, TextField, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'

export interface ReconstructBalanceCardProps {
  reconstructDate: string
  onDateChange: (date: string) => void
  onReconstruct: () => void
  onOpenAdjustment: () => void
  reconstructResult: number | null
  displayCurrency: string
}

export default function ReconstructBalanceCard({
  reconstructDate,
  onDateChange,
  onReconstruct,
  onOpenAdjustment,
  reconstructResult,
  displayCurrency
}: ReconstructBalanceCardProps): React.ReactElement {
  const { t } = useTranslation()

  return (
    <Paper
      elevation={1}
      sx={{ p: 2, mt: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
    >
      <Grid container spacing={2} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={t('ledger.reconstructAsOf')}
            type="date"
            value={reconstructDate}
            onChange={(e) => onDateChange(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 3 }}>
          <Button variant="outlined" onClick={onReconstruct} disabled={!reconstructDate}>
            {t('ledger.reconstruct')}
          </Button>
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }} sx={{ textAlign: 'end' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={onOpenAdjustment}>
            {t('ledger.addManualAdjustment')}
          </Button>
        </Grid>
        {reconstructResult !== null && (
          <Grid size={{ xs: 12 }}>
            <Typography sx={{ fontWeight: 600 }}>
              {t('ledger.reconstructResult', {
                amount: `${reconstructResult.toLocaleString()} ${displayCurrency}`
              })}
            </Typography>
          </Grid>
        )}
      </Grid>
    </Paper>
  )
}
