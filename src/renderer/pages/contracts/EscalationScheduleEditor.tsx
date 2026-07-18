import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material'
import { Box, Typography, TextField, IconButton, Button, Grid } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'

/**
 * INTENT: Editable multi-year rent-escalation grid for FR-CON-09..13.
 * CONSTRAINT: Year 1 effective_start_date must equal the contract start (BR-17); the parent
 *             validates the full schedule before persisting via contracts:setEscalation.
 * DECISION: Local array state lifted to the parent (this is a controlled component) so the
 *           parent owns the schedule it submits. The "auto-generate" button fills the grid
 *           from a base rent + a comma-separated list of yearly increase percentages.
 */

export interface EscalationRow {
  year_number: number
  effective_start_date: string
  rent_amount: number
  increase_percent_applied: number
  notes?: string
}

interface EscalationScheduleEditorProps {
  rows: EscalationRow[]
  onChange: (rows: EscalationRow[]) => void
  contractStartDate: string
  baseRent: number
  currency: string
}

/** Add 1 year (UTC) to a YYYY-MM-DD date string. */
function addYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export function EscalationScheduleEditor({
  rows,
  onChange,
  contractStartDate,
  baseRent,
  currency
}: EscalationScheduleEditorProps): React.ReactElement {
  const { t } = useTranslation()

  const updateRow = (idx: number, patch: Partial<EscalationRow>): void => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange(next)
  }

  const addRow = (): void => {
    const last = rows[rows.length - 1]
    const nextYear = rows.length + 1
    const nextDate = last ? addYear(last.effective_start_date) : contractStartDate
    onChange([
      ...rows,
      {
        year_number: nextYear,
        effective_start_date: nextDate,
        rent_amount: last ? round2(last.rent_amount) : baseRent,
        increase_percent_applied: 0
      }
    ])
  }

  const removeRow = (idx: number): void => {
    if (rows.length <= 1) return
    const next = rows.filter((_, i) => i !== idx).map((r, i) => ({ ...r, year_number: i + 1 }))
    onChange(next)
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">{t('contract.escalationSchedule')}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addRow}>
          {t('contract.addYear')}
        </Button>
      </Box>
      {rows.map((row, idx) => (
        <Grid container spacing={1} key={idx} sx={{ mb: 1, alignItems: 'center' }}>
          <Grid size={{ xs: 6, sm: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              disabled
              label={t('contract.year')}
              value={row.year_number}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2.5 }}>
            <TextField
              size="small"
              fullWidth
              type="date"
              label={t('contract.effectiveDate')}
              value={row.effective_start_date}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => updateRow(idx, { effective_start_date: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2.5 }}>
            <TextField
              size="small"
              fullWidth
              label={`${t('contract.rentAmount')} (${currency})`}
              value={row.rent_amount}
              onChange={(e) => updateRow(idx, { rent_amount: Number(e.target.value) || 0 })}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              size="small"
              fullWidth
              label={t('contract.increasePercent')}
              value={row.increase_percent_applied}
              onChange={(e) =>
                updateRow(idx, { increase_percent_applied: Number(e.target.value) || 0 })
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2.5 }}>
            <TextField
              size="small"
              fullWidth
              label={t('contract.notes')}
              value={row.notes || ''}
              onChange={(e) => updateRow(idx, { notes: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 1 }}>
            <IconButton size="small" color="error" onClick={() => removeRow(idx)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Grid>
        </Grid>
      ))}
    </Box>
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
