/**
 * @file BackupPage — Backup & Restore management UI (SRS Module 11).
 *
 * INTENT: Let the user create manual backups, view backup history, verify integrity,
 *         restore from a backup, and prune old backups.
 *
 * CONSTRAINTS:
 *   - AGENTS.md: i18n keys only, StandardTable, PageHeader, theme.palette tokens, logical CSS.
 *   - FR-BAK-05: restore requires double confirmation (typing "confirm" in a text field).
 *   - All four states: loading, error, empty, success.
 */

import BackupIcon from '@mui/icons-material/Backup'
import DeleteIcon from '@mui/icons-material/DeleteSweep'
import RestoreIcon from '@mui/icons-material/RestorePage'
import VerifiedIcon from '@mui/icons-material/Verified'
import {
  Box,
  Button,
  Stack,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'

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

export default function BackupPage(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showSuccess, showError, hideSnackbar } = useSnackbar()

  const [backups, setBackups] = useState<BackupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Restore dialog state
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<BackupRow | null>(null)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [restoring, setRestoring] = useState(false)

  // Verification dialog
  const [verifyResult, setVerifyResult] = useState<{
    open: boolean
    valid: boolean
    error?: string
  }>({
    open: false,
    valid: false
  })

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        setLoading(true)
        const data = await window.api.backup.list()
        if (!cancelled) setBackups(data)
      } catch {
        if (!cancelled) showError('common.error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showError])

  const fetchBackups = useCallback(async (): Promise<void> => {
    try {
      const data = await window.api.backup.list()
      setBackups(data)
    } catch {
      showError('common.error')
    }
  }, [showError])

  const handleCreateBackup = useCallback(async (): Promise<void> => {
    setCreating(true)
    try {
      const result = await window.api.backup.create()
      if (result.success) {
        showSuccess('backup.createSuccess')
        fetchBackups()
      } else {
        showError('backup.createFailed')
      }
    } catch {
      showError('backup.createFailed')
    } finally {
      setCreating(false)
    }
  }, [showSuccess, showError, fetchBackups])

  const handleVerify = useCallback(
    async (backupId: number): Promise<void> => {
      try {
        const result = await window.api.backup.verify({ backupId })
        setVerifyResult({ open: true, ...result })
        if (result.valid) {
          fetchBackups()
        }
      } catch {
        showError('common.error')
      }
    },
    [showError, fetchBackups]
  )

  const openRestoreDialog = useCallback((row: BackupRow): void => {
    setSelectedBackup(row)
    setRestoreConfirmText('')
    setRestoreDialogOpen(true)
  }, [])

  const handleRestore = useCallback(async (): Promise<void> => {
    if (!selectedBackup) return
    setRestoring(true)
    try {
      const result = await window.api.backup.restore({
        backupId: selectedBackup.id,
        confirm: true
      })
      setRestoreDialogOpen(false)
      if (result.success && result.requiresRestart) {
        showSuccess('backup.restoreSuccess')
      } else {
        showError(result.error || 'backup.restoreFailed')
      }
    } catch {
      showError('backup.restoreFailed')
    } finally {
      setRestoring(false)
    }
  }, [selectedBackup, showSuccess, showError])

  const handlePrune = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.backup.prune()
      showSuccess(t('backup.pruneSuccess', { count: result.deleted }))
      fetchBackups()
    } catch {
      showError('backup.pruneFailed')
    }
  }, [showSuccess, showError, fetchBackups, t])

  const typeLabel = (type: string): string => t(`backup.type.${type}`, type)
  const statusLabel = (status: string): 'success' | 'error' =>
    status === 'success' ? 'success' : 'error'
  const formatFileSize = (kb: number | null): string =>
    kb != null ? `${kb.toLocaleString()} KB` : '—'

  const columns: GridColDef[] = [
    {
      field: 'created_at',
      headerName: t('common.date'),
      flex: 1,
      minWidth: 160
    },
    {
      field: 'backup_type',
      headerName: t('backup.type.label'),
      flex: 1,
      minWidth: 100,
      renderCell: (params: { row: BackupRow }) => (
        <Chip
          size="small"
          label={typeLabel(params.row.backup_type)}
          color="primary"
          variant="outlined"
        />
      )
    },
    {
      field: 'file_size_kb',
      headerName: t('backup.size'),
      flex: 1,
      minWidth: 90,
      valueFormatter: (value: number | null) => formatFileSize(value)
    },
    {
      field: 'is_verified',
      headerName: t('backup.verified'),
      flex: 1,
      minWidth: 100,
      renderCell: (params: { row: BackupRow }) => (
        <Chip
          size="small"
          label={params.row.is_verified ? t('common.yes') : t('common.no')}
          color={params.row.is_verified ? 'success' : 'default'}
        />
      )
    },
    {
      field: 'status',
      headerName: t('backup.status'),
      flex: 1,
      minWidth: 90,
      renderCell: (params: { row: BackupRow }) => (
        <Chip
          size="small"
          label={statusLabel(params.row.status)}
          color={statusLabel(params.row.status)}
        />
      )
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 2,
      minWidth: 200,
      sortable: false,
      renderCell: (params: { row: BackupRow }) => (
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            variant="outlined"
            color="info"
            startIcon={<VerifiedIcon />}
            onClick={() => handleVerify(params.row.id)}
            disabled={params.row.status !== 'success'}
          >
            {t('backup.verify')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<RestoreIcon />}
            onClick={() => openRestoreDialog(params.row)}
            disabled={params.row.status !== 'success'}
          >
            {t('backup.restore')}
          </Button>
        </Stack>
      )
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<BackupIcon />}
        title={t('backup.title')}
        subtitle={t('backup.subtitle')}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <BackupIcon />}
              onClick={handleCreateBackup}
              disabled={creating}
            >
              {creating ? t('backup.creating') : t('backup.createNow')}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handlePrune}
            >
              {t('backup.prune')}
            </Button>
          </Stack>
        }
      />

      <StandardTable
        columns={columns}
        rows={backups}
        loading={loading}
        emptyMessage={t('backup.noBackups')}
        pageSize={15}
        pageSizeOptions={[10, 15, 25]}
      />

      {/* Restore confirmation dialog — FR-BAK-05 double confirmation */}
      <Dialog
        open={restoreDialogOpen}
        onClose={() => !restoring && setRestoreDialogOpen(false)}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <DialogTitle>{t('backup.restoreConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('backup.restoreConfirmBody', {
              date: selectedBackup?.created_at ?? '',
              type: selectedBackup ? typeLabel(selectedBackup.backup_type) : ''
            })}
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('backup.restoreWarning')}
          </Alert>
          <TextField
            fullWidth
            label={t('backup.restoreTypeConfirm')}
            value={restoreConfirmText}
            onChange={(e) => setRestoreConfirmText(e.target.value)}
            placeholder={t('backup.restoreConfirmPlaceholder')}
            slotProps={{ htmlInput: { dir: 'ltr' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)} disabled={restoring}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleRestore}
            disabled={restoreConfirmText.toLowerCase() !== 'confirm' || restoring}
          >
            {restoring ? <CircularProgress size={18} color="inherit" /> : t('backup.restoreButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Verification result dialog */}
      <Dialog
        open={verifyResult.open}
        onClose={() => setVerifyResult((prev) => ({ ...prev, open: false }))}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <DialogTitle>{t('backup.verifyResult')}</DialogTitle>
        <DialogContent>
          <Alert severity={verifyResult.valid ? 'success' : 'error'}>
            {verifyResult.valid
              ? t('backup.verifySuccess')
              : verifyResult.error || t('backup.verifyFailed')}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVerifyResult((prev) => ({ ...prev, open: false }))}>
            {t('common.ok')}
          </Button>
        </DialogActions>
      </Dialog>

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
