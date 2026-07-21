/**
 * INTENT: Reusable settings section wrapper — provides consistent formatting for every
 *         settings section: icon + title + optional description + children content.
 *         Replaces the inconsistent card headers across the settings page.
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS.
 * DECISION: Uses Box instead of Card to avoid double-wrapping when embedded card
 *           components already provide their own Card. Sections stack vertically with
 *           consistent spacing.
 */
import { Box, Typography } from '@mui/material'
import React from 'react'

interface SettingsSectionProps {
  /** Section icon rendered in a colored box. */
  icon: React.ReactNode
  /** Section title (already-translated string). */
  title: string
  /** Optional description rendered below the title. */
  description?: string
  /** Section content (form controls, cards, etc.). */
  children: React.ReactNode
}

export default function SettingsSection({
  icon,
  title,
  description,
  children
}: SettingsSectionProps): React.JSX.Element {
  return (
    <Box sx={{ mb: 5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Box
          aria-hidden
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
            '& svg': { fontSize: 24 }
          }}
        >
          {icon}
        </Box>
        <Typography variant="h4" component="h2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>

      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, ms: 4.5 }}>
          {description}
        </Typography>
      )}

      <Box sx={{ ms: description ? 4.5 : 0 }}>{children}</Box>
    </Box>
  )
}
