/**
 * @file SelectBackupDialog — Modal to let user choose a backup from history or browse disk for a .db file.
 *
 * INTENT: Enforces explicit user backup selection without auto-selecting any backup.
 * CONSTRAINTS: i18n keys only, theme.palette, explicit types, under 500 lines limit.
 */

import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography
} from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface BackupRow {
  id: number
  backup_file_path: string
  backup_type: 'manual' | 'automatic' | 'pre_restore'
  file_size_kb: number | null
  checksum: string | null
  is_verified: number
  status: 'success' | 'failed'
  error_message: string | null
  created_at: string
}

interface SelectBackupDialogProps {
  open: boolean
  backups: BackupRow[]
  isRtl: boolean
  onClose: () => void
  onSelectBackup: (backup: BackupRow) => void
  onBrowseFile: () => void
}

export default function SelectBackupDialog({
  open,
  backups,
  isRtl,
  onClose,
  onSelectBackup,
  onBrowseFile
}: SelectBackupDialogProps): React.ReactElement {
  const { t } = useTranslation()
  const [chosenId, setChosenId] = useState<number | ''>('')

  const handleConfirm = (): void => {
    if (chosenId === '') return
    const found = backups.find((b) => b.id === chosenId)
    if (found) {
      onSelectBackup(found)
      setChosenId('')
    }
  }

  const typeLabel = (type: string): string => t(`backup.type.${type}`, type)
  const formatFileSize = (kb: number | null): string =>
    kb != null ? `${kb.toLocaleString()} KB` : '—'

  return (
    <Dialog open={open} onClose={onClose} dir={isRtl ? 'rtl' : 'ltr'} maxWidth="sm" fullWidth>
      <DialogTitle>{t('backup.selectBackupTitle')}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t('backup.selectBackupSubtitle')}
        </Typography>

        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
          <InputLabel id="select-backup-label">{t('backup.selectBackupLabel')}</InputLabel>
          <Select
            labelId="select-backup-label"
            label={t('backup.selectBackupLabel')}
            value={chosenId}
            onChange={(e) => setChosenId(e.target.value as number | '')}
          >
            <MenuItem value="">
              <em>{t('backup.selectBackupPlaceholder')}</em>
            </MenuItem>
            {backups
              .filter((b) => b.status === 'success')
              .map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.created_at} — {typeLabel(b.backup_type)} ({formatFileSize(b.file_size_kb)})
                </MenuItem>
              ))}
          </Select>
        </FormControl>

        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {t('backup.browseFileOr')}
        </Typography>
        <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={onBrowseFile} fullWidth>
          {t('backup.browseFile')}
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConfirm}
          disabled={chosenId === ''}
        >
          {t('common.next')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
