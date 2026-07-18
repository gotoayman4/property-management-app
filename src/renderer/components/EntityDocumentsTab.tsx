/**
 * INTENT: Reusable "Documents" tab content for entity detail pages (Property, Tenant,
 *         Contract, Expense). Lists attached documents with type, expiry badge, and
 *         Replace + Archive actions; embeds the DocumentUploadForm for new uploads.
 * CONSTRAINT (AGENTS.md): StandardTable for lists, i18n keys only.
 * CONSTRAINT (FR-DOC-05/06/07): expiry-warning badge; replace uploads a new version
 *             and archives the old; archive is a soft-delete (file kept on disk).
 */
import { Delete as DeleteIcon, Update as ReplaceIcon } from '@mui/icons-material'
import { Box, Button, Chip, Stack } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnackbar } from '../hooks/useSnackbar'
import DocumentUploadForm from './DocumentUploadForm'
import GlobalSnackbar from './GlobalSnackbar'
import StandardTable from './StandardTable'

interface DocumentRow {
  id: number
  file_name: string
  mime_type: string
  description: string | null
  document_type: string | null
  issue_date: string | null
  expiry_date: string | null
  is_archived: number
  replaced_by: number | null
  uploaded_at: string
}

interface EntityDocumentsTabProps {
  entityType: 'property' | 'tenant' | 'contract' | 'expense'
  entityId: number
}

// FR-DOC-05: "expiring soon" = within 30 days. Aligned with the default reminder window
// (settings.reminder_days_before_document_expiry); the notification evaluator handles
// the authoritative computation, this badge is a visual aid in the list.
const EXPIRY_SOON_DAYS = 30

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function EntityDocumentsTab({
  entityType,
  entityId
}: EntityDocumentsTabProps): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [replacingId, setReplacingId] = useState<number | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async (): Promise<void> => {
    try {
      const data = await window.api.documents.list({
        entity_type: entityType,
        entity_id: entityId
      })
      setDocuments(data as DocumentRow[])
    } catch {
      /* keep empty */
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const data = await window.api.documents.list({
          entity_type: entityType,
          entity_id: entityId
        })
        if (!cancelled) setDocuments(data as DocumentRow[])
      } catch {
        /* keep empty */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  const handleArchive = async (docId: number): Promise<void> => {
    try {
      await window.api.documents.delete(docId)
      showSuccess('documents.archive')
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch {
      showError('common.deleteError')
    }
  }

  // FR-DOC-06: Replace opens the OS file picker; the chosen file is sent to the
  // documents:replace handler, which archives the old version atomically.
  const handleReplacePick = (docId: number): void => {
    setReplacingId(docId)
    replaceInputRef.current?.click()
  }

  const handleReplaceFileChosen = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0]
    const oldId = replacingId
    setReplacingId(null)
    if (event.target) event.target.value = ''
    if (!file || !oldId) return

    try {
      const buffer = await file.arrayBuffer()
      await window.api.documents.replace({
        old_document_id: oldId,
        file_name: file.name,
        file_buffer: new Uint8Array(buffer)
      })
      showSuccess('documents.replaceSuccess')
      await fetchDocuments()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message === 'INVALID_MIME_TYPE') {
        showError('documents.invalidFileContent')
      } else if (message === 'FILE_TOO_LARGE') {
        showError('documents.fileTooLarge')
      } else {
        showError('documents.uploadFailed')
      }
    }
  }

  const columns: GridColDef[] = [
    { field: 'file_name', headerName: t('documents.fileName'), flex: 2 },
    {
      field: 'document_type',
      headerName: t('documents.documentType'),
      flex: 1,
      renderCell: (params) => {
        const type = (params.row as DocumentRow).document_type
        return type ? t(`documents.types.${type}`) : '—'
      }
    },
    {
      field: 'issue_date',
      headerName: t('documents.issueDate'),
      flex: 1,
      renderCell: (params) => (params.row as DocumentRow).issue_date ?? '—'
    },
    {
      field: 'expiry_date',
      headerName: t('documents.expiryDate'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as DocumentRow
        if (!row.expiry_date) return '—'
        const days = daysUntil(row.expiry_date)
        const color = days < 0 ? 'error' : days <= EXPIRY_SOON_DAYS ? 'warning' : 'success'
        const label =
          days < 0
            ? t('documents.expired')
            : days <= EXPIRY_SOON_DAYS
              ? t('documents.expiringSoon')
              : row.expiry_date
        return <Chip size="small" color={color} variant="outlined" label={label} />
      }
    },
    { field: 'uploaded_at', headerName: t('documents.uploadedAt'), flex: 1 },
    {
      field: 'actions',
      headerName: '',
      flex: 1,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<ReplaceIcon />}
            onClick={() => handleReplacePick((params.row as DocumentRow).id)}
          >
            {t('documents.replace')}
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => handleArchive((params.row as DocumentRow).id)}
          >
            {t('documents.archive')}
          </Button>
        </Stack>
      )
    }
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Hidden input used for the Replace file picker (FR-DOC-06). */}
      <input
        ref={replaceInputRef}
        type="file"
        hidden
        accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx"
        onChange={handleReplaceFileChosen}
      />
      <StandardTable
        columns={columns}
        rows={documents}
        loading={loading}
        emptyMessage={t('propertyDetail.noDocuments')}
      />
      <DocumentUploadForm entityType={entityType} entityId={entityId} onSuccess={fetchDocuments} />
      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
