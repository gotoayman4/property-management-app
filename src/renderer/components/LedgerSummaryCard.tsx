import { Paper, Typography } from '@mui/material'
import React from 'react'

export interface LedgerSummaryCardProps {
  label: string
  value: number
  currency: string
  tone: 'success' | 'error'
}

/** Summary metric tile for the debit/credit/net bar in Ledger. */
export default function LedgerSummaryCard({
  label,
  value,
  currency,
  tone
}: LedgerSummaryCardProps): React.ReactElement {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        minWidth: 160,
        p: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, color: `${tone}.main` }}>
        {value.toLocaleString()} {currency}
      </Typography>
    </Paper>
  )
}
