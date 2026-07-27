/**
 * @file AboutUpdatesCard — Settings › About section: app identity, version, and auto-updates.
 *
 * INTENT: The single "About" surface of the app (Windows Settings › System › About pattern —
 *         chosen over a floating dialog so version + update state live where users expect
 *         system information). Shows the app version (fed from package.json via app:getInfo),
 *         runtime versions, and drives the full update flow: check → download → install.
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS, no business
 *         logic — every decision (semver compare, hash verify) lives in the main process;
 *         this card only renders updater state and forwards user intent over IPC.
 * CAVEAT: update state is global in main; the card resyncs via updates:getState on mount and
 *         subscribes to updates:state pushes, so progress survives navigation away and back.
 */
import DownloadIcon from '@mui/icons-material/Download'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import UpdateIcon from '@mui/icons-material/Update'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  LinearProgress,
  Link,
  Switch,
  Typography
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppInfo, UpdateState } from '../../preload/index.d'
import appIcon from '../assets/logo.png'
import SettingsSection from './SettingsSection'

interface AboutUpdatesCardProps {
  /** Current value of settings.auto_update_check (1 = automatic checks enabled). */
  autoUpdateCheck: number
  /** Persists a settings field change (delegates to settings:update). */
  onUpdateField: (field: string, value: unknown) => Promise<void>
}

export default function AboutUpdatesCard({
  autoUpdateCheck,
  onUpdateField
}: AboutUpdatesCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.app.getInfo().then((data) => mounted && setInfo(data))
    window.api.updates.getState().then((state) => mounted && setUpdate(state))
    const unsubscribe = window.api.updates.onState((state) => mounted && setUpdate(state))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const phase = update?.phase ?? 'idle'
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'verifying'

  const publishedDate = update?.info?.publishedAt
    ? new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en', {
        dateStyle: 'medium'
      }).format(new Date(update.info.publishedAt))
    : ''

  return (
    <SettingsSection
      icon={<InfoOutlinedIcon />}
      title={t('about.title')}
      description={t('about.subtitle')}
    >
      {/* App identity */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box
          component="img"
          src={appIcon}
          alt=""
          sx={{ inlineSize: 56, blockSize: 56, borderRadius: 2 }}
        />
        <Box>
          <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
            {t('app.brand')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('about.version')}
            </Typography>
            <Chip label={info?.version ?? '…'} size="small" variant="outlined" />
          </Box>
        </Box>
      </Box>

      {/* Update status + actions */}
      <Box sx={{ mb: 3 }}>
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
            {t(
              update?.errorCode === 'UPDATE_CHECKSUM_MISMATCH' ||
                update?.errorCode === 'UPDATE_NO_CHECKSUM'
                ? 'about.updateIntegrityError'
                : update?.errorCode === 'UPDATE_DOWNLOAD_FAILED'
                  ? 'about.updateDownloadError'
                  : 'about.updateCheckError'
            )}
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

      <FormControlLabel
        control={
          <Switch
            checked={autoUpdateCheck === 1}
            onChange={(e) => onUpdateField('auto_update_check', e.target.checked ? 1 : 0)}
          />
        }
        label={t('about.autoUpdateCheck')}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('about.autoUpdateCheckHelp')}
      </Typography>

      <Divider sx={{ mb: 2 }} />

      {/* Runtime details — useful in support conversations */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('about.runtimeInfo')}
      </Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.5 }}>
        {info &&
          (
            [
              ['Electron', info.electron],
              ['Chromium', info.chrome],
              ['Node.js', info.node],
              [t('about.platform'), `${info.platform} (${info.arch})`]
            ] as const
          ).map(([label, value]) => (
            <React.Fragment key={label}>
              <Typography component="dt" variant="body2" color="text.secondary" sx={{ pe: 3 }}>
                {label}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                {value}
              </Typography>
            </React.Fragment>
          ))}
      </Box>

      {info && (
        <Typography variant="body2" sx={{ mt: 2 }}>
          <Link href={info.repoUrl} target="_blank" rel="noreferrer">
            {t('about.projectPage')}
          </Link>
        </Typography>
      )}
    </SettingsSection>
  )
}
