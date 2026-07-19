/**
 * INTENT: Reusable dashboard stat card — icon + label + value. Follows the existing
 *         Dashboard card pattern but extracted for reuse and clean separation.
 * CONSTRAINT (AGENTS.md): logical CSS, theme.palette tokens only, i18n keys.
 *         FR-DASH-10: cards are clickable (navigate to related detail screen).
 */
import { Card, CardContent, Typography, Box } from '@mui/material'
import React from 'react'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  color: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'
  onClick?: () => void
}

export default function StatCard({
  icon,
  label,
  value,
  color,
  onClick
}: StatCardProps): React.JSX.Element {
  return (
    <Card sx={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', p: 2.5 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: `${color}.light`,
            color: `${color}.main`,
            display: 'flex',
            marginInline: 1.5
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}
