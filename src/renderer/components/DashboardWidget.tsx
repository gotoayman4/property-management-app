/**
 * @file DashboardWidget — wraps a dashboard section with a hover-reveal hide button.
 *
 * INTENT: Allow users to hide individual dashboard widgets. The hide button (VisibilityOff)
 *         appears on hover in the top-end corner. Clicking it hides the widget and shows
 *         a snackbar with an inline Undo button to reverse the action.
 *
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS properties, theme.palette tokens.
 * DECISION: Uses position:absolute for the hide button so it doesn't affect the widget layout.
 *           Snackbar callbacks are received via props from the parent Dashboard, which owns
 *           the GlobalSnackbar instance. This avoids the pitfall of each widget creating
 *           its own useSnackbar() — the snackbar state would never be rendered.
 */
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { Box, IconButton, Tooltip } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { SnackbarAction } from '../hooks/useSnackbar'
import { useUiPreferences } from '../stores/uiPreferencesStore'

interface DashboardWidgetProps {
  /** Canonical widget ID matching the hiddenWidgets array entries. */
  widgetId: string
  /** The dashboard section content to wrap. */
  children: React.ReactNode
  /** Show a snackbar with an Undo action. Provided by the parent that owns GlobalSnackbar. */
  showUndoSnackbar: (
    messageKey: string,
    action: SnackbarAction,
    params?: Record<string, unknown>
  ) => void
}

export default function DashboardWidget({
  widgetId,
  children,
  showUndoSnackbar
}: DashboardWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const hideWidget = useUiPreferences((s) => s.hideWidget)
  const showWidget = useUiPreferences((s) => s.showWidget)

  const handleHide = (): void => {
    hideWidget(widgetId)
    showUndoSnackbar('dashboard.widgetHidden', {
      label: 'common.undo',
      onClick: () => showWidget(widgetId)
    })
  }

  return (
    <Box
      className="dashboard-widget"
      sx={{
        position: 'relative',
        '& .dashboard-widget-hide-btn': {
          opacity: 0,
          transition: 'opacity 0.2s ease-in-out'
        },
        '&:hover .dashboard-widget-hide-btn': {
          opacity: 1
        }
      }}
    >
      <Tooltip title={t('dashboard.hideWidget')}>
        <IconButton
          className="dashboard-widget-hide-btn"
          size="small"
          onClick={handleHide}
          aria-label={t('dashboard.hideWidget')}
          sx={{
            position: 'absolute',
            top: 4,
            insetInlineEnd: 4,
            zIndex: 1,
            color: 'text.secondary',
            bgcolor: 'background.paper',
            '&:hover': {
              color: 'error.main',
              bgcolor: 'action.hover'
            }
          }}
        >
          <VisibilityOffIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {children}
    </Box>
  )
}
