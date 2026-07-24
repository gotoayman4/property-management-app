/**
 * @file Backup history table column definitions — extracted from BackupPage to keep
 *       that file under the 500-line ESLint max.
 *
 * INTENT: Define the GridColDef[] for the backup list table including renderers for
 *         type/content/status chips and per-row action icons.
 *
 * DECISION: Accept action callbacks as parameters rather than coupling to component state.
 *           The BackupRow type is re-exported here as the canonical shape for backup rows.
 */

import DeleteRowIcon from '@mui/icons-material/Delete'
import RestoreIcon from '@mui/icons-material/RestorePage'
import VerifiedIcon from '@mui/icons-material/Verified'
import { Box, Chip, IconButton, Tooltip } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import type { TFunction } from 'i18next'

export interface BackupRow {
  id: number
  backup_file_path: string
  backup_type: 'manual' | 'automatic' | 'pre_restore'
  backup_content: 'database-only' | 'full'
  file_size_kb: number | null
  checksum: string | null
  is_verified: number
  status: 'success' | 'failed'
  error_message: string | null
  created_at: string
}

interface BackupColumnCallbacks {
  onVerify: (id: number) => void
  onRestore: (row: BackupRow) => void
  onDelete: (id: number) => void
}

const typeLabel = (type: string, t: TFunction): string => t(`backup.type.${type}`, type)
const contentLabel = (content: string, t: TFunction): string =>
  content === 'database-only' ? t('backup.contentDatabaseOnly') : t('backup.contentFull')
const contentColor = (content: string): 'info' | 'success' =>
  content === 'database-only' ? 'info' : 'success'
const statusColor = (status: string): 'success' | 'error' =>
  status === 'success' ? 'success' : 'error'
const statusText = (status: string, t: TFunction): string =>
  t(`backup.status.${status === 'success' ? 'success' : 'failed'}`)
const formatFileSize = (kb: number | null): string =>
  kb != null ? `${kb.toLocaleString()} KB` : '—'

export function getBackupColumns(
  t: TFunction,
  { onVerify, onRestore, onDelete }: BackupColumnCallbacks
): GridColDef[] {
  return [
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
          label={typeLabel(params.row.backup_type, t)}
          color="primary"
          variant="outlined"
        />
      )
    },
    {
      field: 'backup_content',
      headerName: t('backup.content'),
      flex: 1,
      minWidth: 120,
      renderCell: (params: { row: BackupRow }) => (
        <Chip
          size="small"
          label={contentLabel(params.row.backup_content, t)}
          color={contentColor(params.row.backup_content)}
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
      headerName: t('backup.status.label'),
      flex: 1,
      minWidth: 90,
      renderCell: (params: { row: BackupRow }) => (
        <Chip
          size="small"
          label={statusText(params.row.status, t)}
          color={statusColor(params.row.status)}
        />
      )
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1,
      minWidth: 140,
      sortable: false,
      renderCell: (params: { row: BackupRow }) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={t('backup.verify')}>
            <IconButton
              size="small"
              color="info"
              onClick={() => onVerify(params.row.id)}
              disabled={params.row.status !== 'success'}
              aria-label={t('backup.verify')}
            >
              <VerifiedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('backup.restore')}>
            <IconButton
              size="small"
              color="warning"
              onClick={() => onRestore(params.row)}
              disabled={params.row.status !== 'success'}
              aria-label={t('backup.restore')}
            >
              <RestoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('common.delete')}>
            <IconButton
              size="small"
              color="error"
              onClick={() => onDelete(params.row.id)}
              aria-label={t('common.delete')}
            >
              <DeleteRowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
  ]
}
