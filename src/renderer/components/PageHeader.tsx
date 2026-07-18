import { Box, Card, Typography } from '@mui/material'
import React from 'react'

/**
 * INTENT: Shared page header (gradient card + icon box + title/subtitle + optional action).
 * CONSTRAINT: Per design-system-governance + mui-styling tokens — PAGE_HEADER (mb:4, borderRadius:3),
 *             ICON_BOX (p:1.5, borderRadius:2), subtitle in body1/text.secondary. Logical CSS only.
 * DECISION: The guideline documents only icon/title/subtitle; an optional `action` node is added
 *           as a project-level extension so list pages can place their primary button (Add) here
 *           instead of hand-rolling header markup.
 */

interface PageHeaderProps {
  /** Icon element rendered inside the icon box. */
  icon: React.ReactNode
  /** Page title (already-translated string or node). */
  title: React.ReactNode
  /** Optional subtitle, rendered muted under the title. */
  subtitle?: React.ReactNode
  /** Optional action node placed at the inline-end of the header (e.g. an Add button). */
  action?: React.ReactNode
}

export default function PageHeader({
  icon,
  title,
  subtitle,
  action
}: PageHeaderProps): React.JSX.Element {
  return (
    <Card
      elevation={0}
      sx={{
        mb: 4,
        borderRadius: 3,
        p: 2.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        background: (theme) =>
          `linear-gradient(120deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        color: 'common.white'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            p: 1.5,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(255,255,255,0.15)',
            color: 'common.white',
            flexShrink: 0
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.25 }} noWrap>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Card>
  )
}
