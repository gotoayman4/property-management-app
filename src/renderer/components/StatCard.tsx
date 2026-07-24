/**
 * INTENT: Reusable dashboard stat card — icon + label + value. Follows the existing
 *         Dashboard card pattern but extracted for reuse and clean separation.
 * CONSTRAINT (AGENTS.md): logical CSS, theme.palette tokens only, i18n keys.
 *         FR-DASH-10: cards are clickable (navigate to related detail screen).
 */
import { Card, CardContent, Typography, Box, alpha } from '@mui/material'
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
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      sx={{
        cursor: onClick ? 'pointer' : undefined,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: onClick ? 'translateY(-3px)' : undefined,
          boxShadow: (theme) =>
            onClick ? `0 12px 24px -6px ${alpha(theme.palette[color].main, 0.18)}` : undefined,
          '& .stat-icon-wrapper': {
            transform: 'scale(1.08)',
            boxShadow: (theme) => `0 6px 20px 0 ${alpha(theme.palette[color].main, 0.35)}`
          }
        }
      }}
      onClick={onClick}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', p: 2.5 }}>
        <Box
          className="stat-icon-wrapper"
          aria-hidden="true"
          sx={{
            width: 56,
            height: 56,
            borderRadius: '16px',
            background: (theme) =>
              `linear-gradient(135deg, ${alpha(theme.palette[color].main, 0.16)} 0%, ${alpha(
                theme.palette[color].main,
                0.06
              )} 100%)`,
            color: `${color}.main`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginInlineEnd: 2.5,
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette[color].main, 0.22),
            boxShadow: (theme) => `0 4px 12px 0 ${alpha(theme.palette[color].main, 0.15)}`,
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            '& .MuiSvgIcon-root': {
              fontSize: '1.85rem',
              filter: (theme) => `drop-shadow(0 2px 4px ${alpha(theme.palette[color].main, 0.3)})`
            }
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontWeight: 500 }}>
            {label}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}
