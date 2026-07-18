import { Snackbar, Alert, Slide } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { SnackbarState } from '../hooks/useSnackbar'

/**
 * INTENT: Render the single app-wide snackbar notification.
 * CONSTRAINT: Per notification-patterns.md — 4000ms autoHide, 300ms transition,
 *             variant="filled", anchored bottom-center, role="status" + aria-live="polite",
 *             close button present and activatable. Message is always an i18n key.
 * DECISION: Slide transition for a clear enter/exit motion; severity drives the Alert color.
 */

interface GlobalSnackbarProps {
  state: SnackbarState
  onClose: () => void
}

const AUTO_HIDE_MS = 4000
const TRANSITION_MS = 300

const SlideTransition = React.forwardRef(function SlideTransition(
  props: React.ComponentProps<typeof Slide> & { children: React.ReactElement },
  ref: React.Ref<unknown>
): React.ReactElement {
  return <Slide {...props} ref={ref} direction="up" timeout={TRANSITION_MS} />
})

export default function GlobalSnackbar({ state, onClose }: GlobalSnackbarProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <Snackbar
      open={state.open}
      autoHideDuration={AUTO_HIDE_MS}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      slots={{ transition: SlideTransition }}
      sx={{ maxWidth: { xs: '90vw', sm: 480 } }}
    >
      <Alert
        onClose={onClose}
        severity={state.severity}
        variant="filled"
        role="status"
        aria-live="polite"
        sx={{ width: '100%', alignItems: 'center' }}
      >
        {t(state.messageKey, state.params)}
      </Alert>
    </Snackbar>
  )
}
