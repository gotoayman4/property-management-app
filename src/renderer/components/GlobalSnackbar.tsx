import CloseIcon from '@mui/icons-material/Close'
import { Button, IconButton, Snackbar, Alert, Slide } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { SnackbarState } from '../hooks/useSnackbar'

/**
 * INTENT: Render the single app-wide snackbar notification.
 * CONSTRAINT: Per notification-patterns.md — 4000ms autoHide, 300ms transition,
 *             variant="filled", anchored bottom-center, role="status" + aria-live="polite",
 *             close button present and activatable. Message is always an i18n key.
 *             Persistent snacks (state.persistent) never auto-hide — used for actionable
 *             system events like "update ready, restart to install".
 * DECISION: Slide transition for a clear enter/exit motion; severity drives the Alert color.
 *           Optional action button (e.g. Undo) rendered when state.action is provided.
 * CAVEAT: MUI Alert hides its default close icon when a custom `action` is set, so we
 *         render an explicit close IconButton next to the action — every snack (especially
 *         persistent ones) must always offer an escape (Nielsen heuristic).
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
      autoHideDuration={state.persistent ? null : AUTO_HIDE_MS}
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
        action={
          state.action ? (
            <>
              <Button color="inherit" size="small" onClick={state.action.onClick}>
                {t(state.action.label)}
              </Button>
              <IconButton
                aria-label={t('common.close')}
                color="inherit"
                size="small"
                onClick={onClose}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </>
          ) : undefined
        }
      >
        {t(state.messageKey, state.params)}
      </Alert>
    </Snackbar>
  )
}
