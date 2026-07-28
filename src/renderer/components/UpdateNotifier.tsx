/**
 * @file UpdateNotifier — VS Code-style global update notifications (mounted once in Layout).
 *
 * INTENT: Proactively tells the user about update milestones anywhere in the app:
 *         - 'update-available' → persistent info snack with a "Download" action
 *           (only shown when the phase is stable — see CAVEAT below)
 *         - 'ready'            → persistent info snack with a "Restart" action
 *         Mirrors the IDE pattern: quiet background work, one actionable prompt, and the
 *         user always decides when the restart happens.
 * CONSTRAINT (notification-patterns.md): feedback goes through useSnackbar + GlobalSnackbar
 *         (never raw MUI Snackbar); message strings are i18n keys.
 * CAVEAT: when settings.auto_update_download is enabled, main transitions
 *         update-available → downloading almost immediately. The "available" prompt is
 *         therefore debounced (AVAILABLE_NOTIFY_DELAY_MS) and cancelled if the download
 *         starts — the user is then only prompted once the update is verified and ready.
 * DECISION: each milestone notifies at most once per version per session (refs below), so
 *           the 4-hourly background re-checks never nag the user with duplicate prompts.
 */
import React, { useEffect, useRef } from 'react'
import type { UpdateState } from '../../preload/index.d'
import { useSnackbar } from '../hooks/useSnackbar'
import GlobalSnackbar from './GlobalSnackbar'

/** Grace period before announcing 'update-available' — lets auto-download supersede it. */
const AVAILABLE_NOTIFY_DELAY_MS = 2_000

export default function UpdateNotifier(): React.JSX.Element {
  const { snack, showInfoWithAction, hideSnackbar } = useSnackbar()
  /** Versions already announced this session, per milestone. */
  const notifiedAvailableRef = useRef<string | null>(null)
  const notifiedReadyRef = useRef<string | null>(null)
  const availableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearPendingAvailable = (): void => {
      if (availableTimerRef.current) {
        clearTimeout(availableTimerRef.current)
        availableTimerRef.current = null
      }
    }

    const handleState = (state: UpdateState): void => {
      const version = state.info?.version ?? null

      // Any phase change away from 'update-available' cancels the pending announcement
      // (auto-download kicked in, user acted from Settings/About, or an error occurred).
      if (state.phase !== 'update-available') {
        clearPendingAvailable()
      }

      if (
        state.phase === 'update-available' &&
        version &&
        notifiedAvailableRef.current !== version &&
        !availableTimerRef.current
      ) {
        availableTimerRef.current = setTimeout(() => {
          availableTimerRef.current = null
          notifiedAvailableRef.current = version
          showInfoWithAction(
            'about.updateAvailableToast',
            {
              label: 'about.download',
              onClick: () => {
                void window.api.updates.download()
                hideSnackbar()
              }
            },
            { version },
            true
          )
        }, AVAILABLE_NOTIFY_DELAY_MS)
      }

      if (state.phase === 'ready' && version && notifiedReadyRef.current !== version) {
        notifiedReadyRef.current = version
        showInfoWithAction(
          'about.updateReadyToast',
          {
            label: 'about.restart',
            onClick: () => void window.api.updates.install()
          },
          { version },
          true
        )
      }
    }

    // Snapshot first (the updater may already hold a result from the startup check),
    // then stay live on the push channel.
    window.api.updates.getState().then(handleState)
    const unsubscribe = window.api.updates.onState(handleState)
    return () => {
      unsubscribe()
      clearPendingAvailable()
    }
  }, [showInfoWithAction, hideSnackbar])

  return <GlobalSnackbar state={snack} onClose={hideSnackbar} />
}
