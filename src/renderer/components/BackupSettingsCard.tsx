/**
 * @file BackupSettingsCard — folder picker + retention limit card shown on the Backup page.
 *
 * INTENT: Self-contained card that lets the user choose where backups are stored (via the native
 *         OS folder picker) and how many to keep. Owns its own settings state so BackupPage stays
 *         under the 500-line limit and stays focused on the backup history/restore flow.
 *
 * CONSTRAINTS:
 *   - AGENTS.md: i18n keys only, theme.palette tokens, logical CSS.
 *   - Sync with the Settings page is via mount-time refetch (no reactive store, per
 *     uiPreferencesStore design — only one routed page is mounted at a time).
 *   - Max-backups range 1..100 enforced server-side by settingsUpdateSchema; we also clamp
 *     client-side so transient bad values never reach the IPC layer.
 *
 * DECISION: Extracted from BackupPage.tsx when that file exceeded the 500-line ESLint max-lines
 *           limit after adding the per-row delete action. Lives in components/ because it's a
 *           presentational + IPC-bound block with no router coupling.
 */

import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SettingsIcon from '@mui/icons-material/Settings'
import {
  Box,
  Card,
  CardContent,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnackbar } from '../hooks/useSnackbar'

/** Subset of the settings singleton row consumed by this card. */
interface BackupSettings {
  backup_path: string | null
  max_backup_count: number | null
}

// Spinner-less numeric input styling (AGENTS bans <TextField type="number"> native spinners).
// Mirrors the SPINNER_LESS constant in Settings.tsx — inlining avoids a new shared module for
// one declaration; both call sites are kept in sync by grep.
const SPINNER_LESS = {
  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0
  },
  MozAppearance: 'textfield'
} as const

export default function BackupSettingsCard(): React.ReactElement {
  const { t } = useTranslation()
  const { showSuccess, showError } = useSnackbar()
  const [settings, setSettings] = useState<BackupSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const data = (await window.api.settings.get()) as BackupSettings
        if (!cancelled) setSettings(data)
      } catch {
        if (!cancelled) showError('common.error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showError])

  const updateBackupSetting = useCallback(
    async (field: keyof BackupSettings, value: string | number | null): Promise<void> => {
      try {
        await window.api.settings.update({ [field]: value })
        setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))
        showSuccess('common.saveSuccess')
      } catch {
        showError('common.saveError')
      }
    },
    [showSuccess, showError]
  )

  /**
   * INTENT: Open the native OS folder picker and persist the chosen directory as backup_path.
   * CAVEAT: On cancel or error this is a silent no-op — dismissing the dialog is not an error.
   */
  const handleBrowse = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.dialog.pickFolder()
      if (result.canceled || !result.filePath) return
      await updateBackupSetting('backup_path', result.filePath)
    } catch {
      showError('backup.browseError')
    }
  }, [updateBackupSetting, showError])

  if (!settings) return <></>

  return (
    <Card sx={{ mt: 3, mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2.5, alignItems: 'center' }}>
          <SettingsIcon color="action" />
          <Box>
            <Typography variant="h5">{t('backup.settingsTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('backup.settingsSubtitle')}
            </Typography>
          </Box>
        </Stack>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField
              fullWidth
              label={t('backup.locationLabel')}
              value={settings.backup_path ?? ''}
              helperText={
                settings.backup_path
                  ? t('backup.locationSet')
                  : t('backup.locationDefault', {
                      path: '~/Documents/PropertyManager/Backups'
                    })
              }
              slotProps={{
                htmlInput: { dir: 'ltr' },
                input: {
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={handleBrowse} edge="end" aria-label={t('backup.browse')}>
                        <FolderOpenIcon />
                      </IconButton>
                    </InputAdornment>
                  )
                }
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="text"
              inputMode="decimal"
              label={t('backup.maxBackups')}
              // INTENT: 1..100 enforced server-side by settingsUpdateSchema. Coerce empty/garbage to 1.
              value={settings.max_backup_count ?? 10}
              onChange={(e) => {
                const n = Number(e.target.value)
                updateBackupSetting(
                  'max_backup_count',
                  Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 1
                )
              }}
              helperText={t('backup.maxBackupsHelp')}
              slotProps={{
                htmlInput: {
                  dir: 'ltr',
                  min: 1,
                  max: 100,
                  sx: SPINNER_LESS
                }
              }}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}
