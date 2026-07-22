import { useCallback, useState } from 'react'

/**
 * INTENT: Provide a single snackbar-notification state holder + typed helpers.
 * CONSTRAINT: Per notification-patterns.md — four severities (success/error/warning/info),
 *             messages are always i18n keys (never hardcoded), one active snack at a time,
 *             4000ms autoHide handled by the renderer GlobalSnackbar component.
 * DECISION: A hook (not a global store) so each page mounts its own GlobalSnackbar and
 *           the lifecycle stays local to the page that triggers feedback.
 */

export type SnackbarSeverity = 'success' | 'error' | 'warning' | 'info'

export interface SnackbarAction {
  /** i18n key for the action button label. */
  label: string
  /** Callback when the action button is clicked. */
  onClick: () => void
}

export interface SnackbarState {
  open: boolean
  messageKey: string
  severity: SnackbarSeverity
  /** Optional i18n interpolation params forwarded to t(). */
  params?: Record<string, unknown>
  /** Optional action button (e.g. Undo). Rendered as a Button inside the Alert. */
  action?: SnackbarAction
}

const CLOSED: SnackbarState = { open: false, messageKey: '', severity: 'info' }

export interface UseSnackbarReturn {
  snack: SnackbarState
  showSuccess: (messageKey: string, params?: Record<string, unknown>) => void
  showError: (messageKey: string, params?: Record<string, unknown>) => void
  showWarning: (messageKey: string, params?: Record<string, unknown>) => void
  showInfo: (messageKey: string, params?: Record<string, unknown>) => void
  showInfoWithAction: (
    messageKey: string,
    action: SnackbarAction,
    params?: Record<string, unknown>
  ) => void
  hideSnackbar: () => void
}

/**
 * Owns snackbar state. Render `<GlobalSnackbar state={snack} onClose={hideSnackbar} />`
 * exactly once in the component that calls this hook.
 */
export function useSnackbar(): UseSnackbarReturn {
  const [snack, setSnack] = useState<SnackbarState>(CLOSED)

  const show = useCallback(
    (
      severity: SnackbarSeverity,
      messageKey: string,
      params?: Record<string, unknown>,
      action?: SnackbarAction
    ): void => {
      setSnack({ open: true, messageKey, severity, params, action })
    },
    []
  )

  const showSuccess = useCallback(
    (messageKey: string, params?: Record<string, unknown>) => show('success', messageKey, params),
    [show]
  )
  const showError = useCallback(
    (messageKey: string, params?: Record<string, unknown>) => show('error', messageKey, params),
    [show]
  )
  const showWarning = useCallback(
    (messageKey: string, params?: Record<string, unknown>) => show('warning', messageKey, params),
    [show]
  )
  const showInfo = useCallback(
    (messageKey: string, params?: Record<string, unknown>) => show('info', messageKey, params),
    [show]
  )
  const showInfoWithAction = useCallback(
    (messageKey: string, action: SnackbarAction, params?: Record<string, unknown>) =>
      show('info', messageKey, params, action),
    [show]
  )

  const hideSnackbar = useCallback((): void => {
    // Keep the last message so the exit animation reads correct text; just close.
    setSnack((prev) => ({ ...prev, open: false }))
  }, [])

  return {
    snack,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showInfoWithAction,
    hideSnackbar
  }
}
