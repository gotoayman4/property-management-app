/**
 * INTENT: Reusable document upload dialog with document_type selector + optional issue_date
 *         and expiry_date fields. Validates file type + size at the boundary (magic bytes in
 *         the main process); a light client-side pre-check gives immediate feedback.
 *         Used by PropertyDetail, TenantDetail, ContractDetail, and ExpenseDetail tabs.
 * CONSTRAINT (AGENTS.md): all text uses i18n keys. No MUI DatePicker — no LocalizationProvider.
 * DECISION: Uses <TextField type="date"> to match the rest of the app (no extra provider needed).
 * CONSTRAINT (FR-DOC-03): accepted formats are PDF, JPG, PNG, DOCX, XLSX; max 10 MB.
 */
import { CloudUpload as UploadIcon } from '@mui/icons-material'
import {
  Box,
  Button,
  Typography,
  Stack,
  LinearProgress,
  Alert,
  TextField,
  MenuItem
} from '@mui/material'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useSnackbar } from '../hooks/useSnackbar'
import GlobalSnackbar from './GlobalSnackbar'

interface DocumentUploadFormProps {
  entityType: 'property' | 'tenant' | 'contract' | 'expense'
  entityId: number
  onSuccess: () => void
}

interface FormValues {
  description: string
  document_type: string
  issue_date: string
  expiry_date: string
}

// FR-DOC-03 / SRS §9.11: PDF, JPG, PNG, DOCX, XLSX.
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.docx', '.xlsx']
// FR-DOC-03: 10 MB hard cap (matches the main-process assertion).
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/**
 * Returns the document_type options appropriate to the entity. SRS §8.2 lists per-entity
 * vocabularies (property_documents vs tenant_documents vs contract_documents); the unified
 * `documents` table (ADR-002 D1) stores a single document_type column, so we present the
 * SRS-appropriate subset per entity.
 */
function documentTypeOptions(entityType: DocumentUploadFormProps['entityType']): string[] {
  switch (entityType) {
    case 'property':
      return [
        'deed',
        'insurance_policy',
        'utility_contract',
        'maintenance_record',
        'municipal_permit',
        'image',
        'other'
      ]
    case 'tenant':
      return ['id_copy', 'contract', 'other']
    case 'contract':
      return ['signed_contract', 'addendum', 'other']
    case 'expense':
      return ['receipt', 'invoice', 'other']
    default:
      return ['other']
  }
}

export default function DocumentUploadForm({
  entityType,
  entityId,
  onSuccess
}: DocumentUploadFormProps): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState<boolean>(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      description: '',
      document_type: entityType === 'property' ? 'deed' : 'other',
      issue_date: '',
      expiry_date: ''
    }
  })

  const typeOptions = useMemo(() => documentTypeOptions(entityType), [entityType])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setUploadError(t('documents.invalidFileType'))
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError(t('documents.fileTooLarge'))
        return
      }

      setSelectedFile(file)
      setUploadError(null)
    },
    [t]
  )

  const handleValidSubmit = useCallback(
    async (values: FormValues): Promise<void> => {
      if (!selectedFile) {
        setUploadError(t('documents.selectFile'))
        return
      }

      try {
        setUploading(true)
        setUploadError(null)

        const buffer = await selectedFile.arrayBuffer()
        const uint8Array = new Uint8Array(buffer)

        await window.api.documents.upload({
          entity_type: entityType,
          entity_id: entityId,
          file_name: selectedFile.name,
          file_buffer: uint8Array,
          description: values.description || undefined,
          document_type: values.document_type,
          issue_date: values.issue_date || undefined,
          expiry_date: values.expiry_date || undefined
        })

        showSuccess('documents.uploadSuccess')
        setSelectedFile(null)
        reset()
        if (fileInputRef.current) fileInputRef.current.value = ''
        onSuccess()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
        if (message === 'INVALID_MIME_TYPE') {
          setUploadError(t('documents.invalidFileContent'))
        } else if (message === 'FILE_TOO_LARGE') {
          setUploadError(t('documents.fileTooLarge'))
        } else {
          showError('documents.uploadFailed')
        }
      } finally {
        setUploading(false)
      }
    },
    [selectedFile, entityType, entityId, t, reset, onSuccess, showSuccess, showError]
  )

  const handleSubmitClick = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault()
      void handleSubmit(handleValidSubmit)()
    },
    [handleSubmit, handleValidSubmit]
  )

  return (
    <Box component="form" onSubmit={handleSubmitClick}>
      <Stack spacing={2}>
        <Button
          variant="outlined"
          component="label"
          startIcon={<UploadIcon />}
          sx={{ alignSelf: 'flex-start' }}
        >
          {selectedFile ? selectedFile.name : t('documents.selectFile')}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={handleFileChange}
          />
        </Button>

        {selectedFile && (
          <Typography variant="body2" color="text.secondary">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </Typography>
        )}

        {uploadError && <Alert severity="error">{uploadError}</Alert>}

        <Controller
          name="document_type"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              select
              label={t('documents.documentType')}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            >
              {typeOptions.map((type) => (
                <MenuItem key={type} value={type}>
                  {t(`documents.types.${type}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
        />

        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={`${t('common.description')} (${t('common.optional')})`}
              multiline
              rows={2}
              size="small"
              fullWidth
            />
          )}
        />

        <Controller
          name="issue_date"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('documents.issueDate')}
              type="date"
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        />

        <Controller
          name="expiry_date"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label={t('documents.expiryDate')}
              type="date"
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        />

        {uploading && <LinearProgress />}

        <Button
          type="submit"
          variant="contained"
          disabled={!selectedFile || uploading}
          startIcon={<UploadIcon />}
        >
          {uploading ? t('documents.uploading') : t('documents.upload')}
        </Button>
      </Stack>

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
