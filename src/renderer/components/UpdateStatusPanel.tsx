/**
 * @file UpdateStatusPanel — shared update-status UI: alerts, download progress, action buttons.
 *
 * INTENT: One rendering of the updater state machine reused by both update surfaces
 *         (Settings › About card and the topbar About dialog) so status texts, error
 *         mapping, and the check/download/install actions can never drift apart.
 * CONSTRAINT (AGENTS.md): i18n keys only, theme tokens only, no business logic — the
 *         component just renders `UpdateState` and forwards user intent over IPC.
 * CAVEAT: phase 'update-available' may last only an instant when auto-download is enabled
 *         (main immediately transitions to 'downloading'); the panel simply re-renders.
 */
import DownloadIcon from '@mui/icons-material/Download'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import UpdateIcon from '@mui/icons-material/Update'
import { Alert, Box, Button, CircularProgress, LinearProgress, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { UpdateState } from '../../preload/index.d'

interface UpdateStatusPanelProps {
  /** Live updater state (null until the first IPC round-trip = treated as idle). */
  update: UpdateState | null
}

/** Map an updater errorCode to the matching localized message key. */
function errorMessageKey(errorCode: string | null | undefined): string {
  if (errorCode === 'UPDATE_CHECKSUM_MISMATCH' || errorCode === 'UPDATE_NO_CHECKSUM') {
    return 'about.updateIntegrityError'
  }
  if (errorCode === 'UPDATE_DOWNLOAD_FAILED') {
    return 'about.updateDownloadError'
  }
  return 'about.updateCheckError'
}

export default function UpdateStatusPanel({ update }: UpdateStatusPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation()

  const phase = update?.phase ?? 'idle'
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'verifying'

  const publishedDate = update?.info?.publishedAt
    ? new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en', {
        dateStyle: 'medium'
      }).format(new Date(update.info.publishedAt))
    : ''

  return (
    <Box>
      {phase === 'up-to-date' && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {t('about.upToDate')}
        </Alert>
      )}
      {phase === 'update-available' && update?.info && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('about.updateAvailable', { version: update.info.version, date: publishedDate })}
        </Alert>
      )}
      {phase === 'ready' && update?.info && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('about.updateReady', { version: update.info.version })}
        </Alert>
      )}
      {phase === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t(errorMessageKey(update?.errorCode))}
        </Alert>
      )}
      {(phase === 'downloading' || phase === 'verifying') && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {phase === 'verifying'
              ? t('about.verifying')
              : t('about.downloading', { progress: update?.progress ?? 0 })}
          </Typography>
          <LinearProgress
            variant={phase === 'verifying' ? 'indeterminate' : 'determinate'}
            value={update?.progress ?? 0}
          />
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {(phase === 'idle' ||
          phase === 'up-to-date' ||
          phase === 'checking' ||
          phase === 'error') && (
          <Button
            variant="outlined"
            startIcon={phase === 'checking' ? <CircularProgress size={18} /> : <UpdateIcon />}
            disabled={busy}
            onClick={() => window.api.updates.check()}
          >
            {t('about.checkForUpdates')}
          </Button>
        )}
        {phase === 'update-available' && (
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => window.api.updates.download()}
          >
            {t('about.downloadUpdate')}
          </Button>
        )}
        {phase === 'ready' && (
          <Button
            variant="contained"
            startIcon={<RestartAltIcon />}
            onClick={() => window.api.updates.install()}
          >
            {t('about.installAndRestart')}
          </Button>
        )}
      </Box>
    </Box>
  )
}
