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
import RestoreIcon from '@mui/icons-material/RestorePage'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BackupSettingsCard from '../../components/BackupSettingsCard'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'
import { BackupRow, getBackupColumns } from './backupColumns'
import SelectBackupDialog from './SelectBackupDialog'

export default function BackupPage(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showSuccess, showError, hideSnackbar } = useSnackbar()

  const [backups, setBackups] = useState<BackupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [creatingQuick, setCreatingQuick] = useState(false)

  // Select backup selection dialog state (no auto-selection)
  const [selectDialogOpen, setSelectDialogOpen] = useState(false)

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

  // Post-restore restart prompt
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)

  // Per-row delete confirmation state — idiom matches PropertyList/ContractList/TenantList:
  // handleDeleteClick only stages the id; the ConfirmDialog onConfirm performs the actual call.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

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

  const handleCreateQuickBackup = useCallback(async (): Promise<void> => {
    setCreatingQuick(true)
    try {
      const result = await window.api.backup.createDatabaseOnly()
      if (result.success) {
        showSuccess('backup.quickBackupSuccess')
        fetchBackups()
      } else {
        showError('backup.quickBackupFailed')
      }
    } catch {
      showError('backup.quickBackupFailed')
    } finally {
      setCreatingQuick(false)
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

  const handleHeaderRestore = useCallback((): void => {
    setSelectDialogOpen(true)
  }, [])

  const handleSelectBackup = useCallback((backup: BackupRow): void => {
    setSelectedBackup(backup)
    setRestoreConfirmText('')
    setSelectDialogOpen(false)
    setRestoreDialogOpen(true)
  }, [])

  const handleBrowseFile = useCallback(async (): Promise<void> => {
    try {
      const res = await window.api.dialog.pickBackupFile()
      if (!res.canceled && res.filePath) {
        const restoreRes = await window.api.backup.restore({
          filePath: res.filePath,
          confirm: false
        })
        if ('backupInfo' in restoreRes && restoreRes.backupInfo) {
          setSelectedBackup(restoreRes.backupInfo as BackupRow)
          setRestoreConfirmText('')
          setSelectDialogOpen(false)
          setRestoreDialogOpen(true)
          fetchBackups()
        }
      }
    } catch {
      showError('backup.browseError')
    }
  }, [fetchBackups, showError])

  const handleRestore = useCallback(async (): Promise<void> => {
    if (!selectedBackup) return
    setRestoring(true)
    try {
      const result = await window.api.backup.restore({
        backupId: selectedBackup.id,
        confirm: true
      })
      setRestoreDialogOpen(false)
      if (
        'success' in result &&
        result.success &&
        'requiresRestart' in result &&
        result.requiresRestart
      ) {
        // INTENT: Don't auto-restart — the user might have unsaved view state.
        //         Prompt explicitly; "Restart Now" calls window.api.backup.relaunch().
        setRestartDialogOpen(true)
      } else if ('error' in result) {
        showError(result.error || 'backup.restoreFailed')
      }
    } catch {
      showError('backup.restoreFailed')
    } finally {
      setRestoring(false)
    }
  }, [selectedBackup, showError])

  const handleRestartNow = useCallback(async (): Promise<void> => {
    try {
      await window.api.backup.relaunch()
    } catch {
      showError('backup.restoreFailed')
    }
  }, [showError])

  /**
   * INTENT: Stage a backup row for deletion. The ConfirmDialog's onConfirm performs the actual
   *         API call — this only opens the dialog. Mirrors the pendingDeleteId idiom in
   *         PropertyList/ContractList so destructive actions never fire without confirmation.
   */
  const handleDeleteClick = useCallback((id: number): void => {
    setPendingDeleteId(id)
  }, [])

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (pendingDeleteId === null) return
    try {
      const result = await window.api.backup.delete({ backupId: pendingDeleteId })
      if (result.success) {
        showSuccess('common.deleteSuccess')
        fetchBackups()
      } else {
        showError(result.error || 'common.deleteError')
      }
    } catch {
      showError('common.deleteError')
    } finally {
      setPendingDeleteId(null)
    }
  }, [pendingDeleteId, showSuccess, showError, fetchBackups])

  const columns = getBackupColumns(t, {
    onVerify: handleVerify,
    onRestore: openRestoreDialog,
    onDelete: handleDeleteClick
  })

  return (
    <Box sx={{ width: '100%' }}>
      <PageHeader
        icon={<BackupIcon />}
        title={t('backup.title')}
        subtitle={t('backup.subtitle')}
        action={
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Tooltip title={t('backup.restoreTooltip')}>
              <span>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<RestoreIcon />}
                  onClick={handleHeaderRestore}
                  disabled={restoring || creating}
                >
                  {t('backup.restore')}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={t('backup.quickBackupTooltip')}>
              <span>
                <Button
                  variant="outlined"
                  color="info"
                  startIcon={
                    creatingQuick ? <CircularProgress size={18} color="inherit" /> : <BackupIcon />
                  }
                  onClick={handleCreateQuickBackup}
                  disabled={creating || creatingQuick}
                >
                  {creatingQuick ? t('backup.quickBackupCreating') : t('backup.quickBackup')}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={t('backup.fullBackupTooltip')}>
              <span>
                <Button
                  variant="contained"
                  startIcon={
                    creating ? <CircularProgress size={18} color="inherit" /> : <BackupIcon />
                  }
                  onClick={handleCreateBackup}
                  disabled={creating || creatingQuick}
                >
                  {creating ? t('backup.creating') : t('backup.createNow')}
                </Button>
              </span>
            </Tooltip>
          </Box>
        }
      />

      {/* Backup Settings card — folder picker + retention limit.
          Extracted to its own component (BackupSettingsCard) so this file stays under the
          ESLint 500-line max. Sync with the Settings page is via mount-time refetch. */}
      <BackupSettingsCard />

      <StandardTable
        columns={columns}
        rows={backups}
        loading={loading}
        emptyMessage={t('backup.noBackups')}
        pageSize={15}
        pageSizeOptions={[10, 15, 25]}
        tableId="backup-list"
      />

      {/* Select Backup dialog — user browses history or disk file without auto-selection */}
      <SelectBackupDialog
        open={selectDialogOpen}
        backups={backups}
        isRtl={isRtl}
        onClose={() => setSelectDialogOpen(false)}
        onSelectBackup={handleSelectBackup}
        onBrowseFile={handleBrowseFile}
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
              type: selectedBackup
                ? t(`backup.type.${selectedBackup.backup_type}`, selectedBackup.backup_type)
                : ''
            })}
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('backup.restoreWarning')}
          </Alert>
          {selectedBackup?.backup_content === 'database-only' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('backup.restoreDatabaseOnlyNote')}
            </Alert>
          )}
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

      {/* Post-restore restart prompt (FR-BAK-05) */}
      <Dialog open={restartDialogOpen} dir={isRtl ? 'rtl' : 'ltr'}>
        <DialogTitle>{t('backup.restoreRestartTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="success">{t('backup.restoreRestartBody')}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestartDialogOpen(false)}>
            {t('backup.restoreRestartLater')}
          </Button>
          <Button variant="contained" color="warning" onClick={handleRestartNow}>
            {t('backup.restoreRestartButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Per-row delete confirmation — shared ConfirmDialog idiom (PropertyList/ContractList). */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('common.confirmDelete')}
        message={t('backup.confirmDeleteMessage')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
        severity="error"
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
