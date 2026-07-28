/**
 * @file AboutUpdatesCard — Settings › About section: app identity, version, and auto-updates.
 *
 * INTENT: The full "About & Updates" surface inside Settings (Windows Settings › System ›
 *         About pattern). Shows the app version (fed from package.json via app:getInfo),
 *         runtime versions, and drives the full update flow: check → download → install.
 *         A compact sibling surface exists as AboutDialog (topbar info icon).
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS, no business
 *         logic — every decision (semver compare, hash verify) lives in the main process;
 *         this card only renders updater state and forwards user intent over IPC.
 * CAVEAT: update state is global in main; useUpdateStatus resyncs via updates:getState on
 *         mount and subscribes to updates:state pushes, so progress survives navigation.
 */
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { Box, Chip, Divider, FormControlLabel, Link, Switch, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import appIcon from '../assets/logo.png'
import { useUpdateStatus } from '../hooks/useUpdateStatus'
import SettingsSection from './SettingsSection'
import UpdateStatusPanel from './UpdateStatusPanel'

interface AboutUpdatesCardProps {
  /** Current value of settings.auto_update_check (1 = automatic checks enabled). */
  autoUpdateCheck: number
  /** Current value of settings.auto_update_download (1 = auto-download found updates). */
  autoUpdateDownload: number
  /** Persists a settings field change (delegates to settings:update). */
  onUpdateField: (field: string, value: unknown) => Promise<void>
}

export default function AboutUpdatesCard({
  autoUpdateCheck,
  autoUpdateDownload,
  onUpdateField
}: AboutUpdatesCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const { info, update } = useUpdateStatus()

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

      {/* Update status + actions (shared with AboutDialog) */}
      <Box sx={{ mb: 3 }}>
        <UpdateStatusPanel update={update} />
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('about.autoUpdateCheckHelp')}
      </Typography>

      <FormControlLabel
        control={
          <Switch
            checked={autoUpdateDownload === 1}
            onChange={(e) => onUpdateField('auto_update_download', e.target.checked ? 1 : 0)}
          />
        }
        label={t('about.autoUpdateDownload')}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('about.autoUpdateDownloadHelp')}
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
        <Typography variant="body2" sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Link href={info.websiteUrl} target="_blank" rel="noreferrer">
            {t('about.website')}
          </Link>
          <Link href={info.repoUrl} target="_blank" rel="noreferrer">
            {t('about.projectPage')}
          </Link>
        </Typography>
      )}
    </SettingsSection>
  )
}
