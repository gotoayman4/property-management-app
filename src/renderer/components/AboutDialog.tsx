/**
 * @file AboutDialog — compact About window opened from the topbar info icon.
 *
 * INTENT: IDE-style "About" (VS Code Help › About): app identity, version, runtime info,
 *         links, and a manual "Check for Updates" action — reachable from anywhere via the
 *         topbar without navigating to Settings. The full preferences surface (auto-check /
 *         auto-download toggles) stays in Settings › About (AboutUpdatesCard).
 * CONSTRAINT (dialog-patterns.md / AGENTS.md): rendered through StandardDialog (focus
 *         restoration, RTL dir, escape handling); i18n keys only; theme tokens only.
 * CAVEAT: update state is global in main — if a download is already running, the dialog
 *         opens showing live progress (useUpdateStatus resyncs on mount).
 */
import { Box, Button, Chip, Divider, Link, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import appIcon from '../assets/logo.png'
import { useUpdateStatus } from '../hooks/useUpdateStatus'
import StandardDialog from './StandardDialog'
import UpdateStatusPanel from './UpdateStatusPanel'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export default function AboutDialog({ open, onClose }: AboutDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { info, update } = useUpdateStatus()

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      title={t('about.title')}
      maxWidth="xs"
      actions={
        <Button onClick={onClose} variant="text">
          {t('common.close')}
        </Button>
      }
    >
      {/* App identity */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box
          component="img"
          src={appIcon}
          alt=""
          sx={{ inlineSize: 48, blockSize: 48, borderRadius: 2 }}
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

      {/* Update status + manual check (shared with Settings › About) */}
      <Box sx={{ mb: 3 }}>
        <UpdateStatusPanel update={update} />
      </Box>

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
    </StandardDialog>
  )
}
